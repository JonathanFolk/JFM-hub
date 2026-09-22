# Phase 1 verification — September 19, 2026

## Passed locally

- TypeScript strict check and production frontend build.
- Fourteen automated tests: service/client boundaries; contractor For J gate; held/cancelled states; repeat imports; moved-event history; transactional rollback; recurring exceptions; cancelled recurrence tombstones; Google expired-cursor reset/pagination; failed partial downloads; review persistence/reopening; encryption tamper detection; production configuration fails closed; backup restore; backup proceeds despite calendar failure; HTTP source-origin checks, secret omission and invalid OAuth state rejection. Several tests cover multiple assertions.
- Real export import repeated with **187 jobs, 0 changed jobs, 88 review items** on the final repeat. No financial source writes. Four ambiguous audit titles remain standalone review items.
- Local backup created from the UI and checked for integrity. Synthetic restored database preserved job count and review note. This is not an off-machine disaster-recovery drill.
- Final dependency audit: **0 reported advisories** across all severity levels, after Vite, csv-parse and esbuild patches. This is a dependency advisory check, not a security certification.
- Isolated Chrome inspection: Overview screenshots visually checked at 390, 1180, 1440 and 2560 CSS-pixel widths. Jobs, Review and Connections checked at 390, 1180 and 1440. No horizontal page overflow or uncaught browser errors in these checks. Search/clear, detail open/Escape and backup button exercised. Small-screen Jobs and Connections screenshots reviewed. Background content is inert while the detail dialog is open.
- The original static-file root issue in the hidden project directory was fixed and covered by the HTTP test.

## Not yet verified / required for hosted acceptance

- Real Google OAuth sign-in, wrong-account denial, refresh-token expiry/reconnect and actual background calendar sync. Plugin access and app OAuth are separate.
- Hosted Canadian residency/processing terms, provider account, hostname/TLS, off-machine backups, independent outage alert and provider restore.
- Human-approved answer key, deadline grid and holiday policy. No 95% parsing-accuracy claim is made; business uncertainty remains visible.
- Full assistive-technology audit, actual iPad/Safari and phone hardware checks, browser 200% zoom and longer shadow operation.
- Thirty daily local copies are implemented; twelve monthly copies and independent Canadian storage remain future deployment work.

Phase 1 is a tested local preview, not a completed production rollout. Phase 2 has not started. App AI usage is zero.

## Seven-calendar update

19 tests now pass, adding explicit calendar selection validation, independent per-calendar IDs/cursors, idempotent multi-calendar resync, failure isolation, titleless contractor cancellations and unknown For J naming review. Connector identity and read access to all seven were verified. The app itself remains on exports pending OAuth setup; no actual scheduled multi-calendar success is claimed.

### September 20 — studio UI refresh
TypeScript check and Vite production build pass. CSS/JSX changes only: spacing, Gotham local font faces, responsive panels and natural numeric display. No business rules, source data or external writes changed. Native-browser visual inspection attempted and blocked by administrator-policy verification; no workaround used. Font rendering and screenshot review remain pending.
