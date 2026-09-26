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
- [x] No permanent deletion endpoint. Draft evidence and earlier versions are retained.
- [x] Review sorting into Real Estate, Commercial, Design or Other. Real Estate sorting records a square-footage band and booked shoots receive a private invoice draft.
- [x] Recently Deleted hides an entire shoot and its linked Hub reviews and draft, even after calendar reimport; restoration returns them to active views. Source calendar events are untouched.
- [x] A private Standard and Legacy rate catalog suggests matching line prices by profile, category, service, currency and square-footage band. Applying a suggestion still requires a human choice; a bulk action can apply only exact matches.
- [x] A local-only import of six reference CSVs keeps customer, historical invoice, backtest, acronym and observed-price evidence separate from approved rates. Unique exact-name matches select the default Standard or Legacy sheet; ambiguous names stay in review. Client-wide, whole-invoice and individual-line overrides are available.
- [x] Optional read-only Gmail connection for `info@jonathanfolk.ca` searches matching commercial quote emails and surfaces explicit CAD or USD amounts as reviewable suggestions. Email bodies are not stored.
- [x] Read-only invoice-evidence sync for the live `2026` master Sheet and business Gmail. The initial manual run scans 30 days, then hourly/manual runs read Gmail changes. The Hub retains source IDs and short excerpts, proposes sent/payment matches, and records Confirm/Dismiss decisions without changing a Sheet checkbox or payment account. Ambiguous amounts and missing matches remain visible. Direct Stripe evidence is not connected yet.

The supplied current Photo (2026 Q2) and Video (2026 Q2a) PDFs seed 43 Standard CAD prices; the two Legacy PDFs seed 44 Legacy CAD prices. The imported pricing evidence says Legacy rates continued for listed clients from April 1, 2026, while all clients used those rates before that date. Automatic drafts default to Legacy for uniquely identified listed clients and 2026 Q1 jobs, or Standard for unique non-Legacy and general real-estate clients. Conflicting or duplicate identities need review. Explicit overrides are audited at client scope and saved on invoice drafts at invoice or line scope; sheet selection never silently rewrites entered prices. Owner clarification resolves both premium-photo `+7001` typos: the published tier ends at 7,500 sq ft, and 7,501+ requires a custom quote. The owner's CAD $1,000–$1,250 expectation appears only as guidance for Standard work. Exact 1,000 and 2,500 sq ft gaps in the printed tiers require manual confirmation. Gmail access requires enabling the Gmail API and adding its read-only scope to the Google OAuth consent configuration before connection.

## Current safety boundary

“Ready” means reviewed inside JFM Hub only. The application does not yet:

- assign a legal invoice number;
- write to the master Google Sheet;
- generate or send a client invoice;
- infer a price from a calendar abbreviation;
- infer Canadian or US tax treatment;
- mark an invoice paid or automatically allocate a payment (the new queue suggests matches for review only);
- change a calendar event.

These are intentional controls, not missing UI wiring. The Google Sheet remains the financial master and previously issued invoices remain frozen.

## Next controlled increments

1. Approve the private Sheet schema, invoice-number allocation rule and conflict/retry behavior.
2. Import a read-only register snapshot and reconcile ready drafts against existing invoice numbers before any write is enabled.
3. Resolve the observed-price and client-identity questions in `PRICING_REVIEW.md` before any Stripe/invoice/email amount becomes an approved rate. Commercial/custom work must remain manually quoted.
4. Define tax decision evidence, particularly USD/US clients; no location-based guess is permitted.
5. Generate a previewable invoice artifact and require a final human confirmation before issuance.
6. Add an append-only Sheet write with idempotency, followed by delivery status. Never overwrite issued financial rows.
7. Add manually confirmed payment allocation, including one payment covering multiple invoices or a different account-holder name.

Every increment requires synthetic tests, a backup/restore check and a production review before the next external write is enabled.
