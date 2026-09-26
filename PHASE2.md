# Phase 2 invoicing

Phase 2 began September 25, 2026 after Jonathan accepted the technical Phase 1 release and authorized its merge to `main`. This document is the working boundary for financial features.

## Implemented foundation

- [x] A private Invoices workspace linked one-to-one with a booked job.
- [x] Draft fields for billing client, property/project, approximate square footage, currency, invoice date, net-30 due date, line descriptions, quantities, integer-cent prices, tax treatment and notes.
- [x] Deterministic subtotal, tax and total calculations using integer cents.
- [x] Explicit confirmation that work occurred before a draft can become ready.
- [x] Ready-state gates for positive prices, square-footage review, explicit tax treatment and resolution of job-specific review items.
- [x] Draft history, audit records and optimistic locking so stale browser edits cannot overwrite newer work.
- [x] Server-side validation; UI labels do not act as the security boundary.
- [x] No deletion endpoint. Draft evidence and earlier versions are retained.

## Current safety boundary

“Ready” means reviewed inside JFM Hub only. The application does not yet:

- assign a legal invoice number;
- write to the master Google Sheet;
- generate or send a client invoice;
- infer a price from a calendar abbreviation;
- infer Canadian or US tax treatment;
- mark an invoice paid or automatically match a payment;
- change a calendar event.

These are intentional controls, not missing UI wiring. The Google Sheet remains the financial master and previously issued invoices remain frozen.

## Next controlled increments

1. Approve the private Sheet schema, invoice-number allocation rule and conflict/retry behavior.
2. Import a read-only register snapshot and reconcile ready drafts against existing invoice numbers before any write is enabled.
3. Define approved pricing profiles and exception ownership. Commercial/custom work must remain manually quoted.
4. Define tax decision evidence, particularly USD/US clients; no location-based guess is permitted.
5. Generate a previewable invoice artifact and require a final human confirmation before issuance.
6. Add an append-only Sheet write with idempotency, followed by delivery status. Never overwrite issued financial rows.
7. Add manually confirmed payment allocation, including one payment covering multiple invoices or a different account-holder name.

Every increment requires synthetic tests, a backup/restore check and a production review before the next external write is enabled.
