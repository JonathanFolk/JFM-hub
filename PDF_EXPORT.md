# Draft invoice PDF export

The invoice editor offers **Download invoice PDF**. This exports an exact snapshot of the current form, including unsaved changes, through the existing authenticated same-origin API. Downloading does not save or issue an invoice, allocate a number, change the master Sheet, send mail, or update payments. PDFs are send-ready without review, draft or reservation markings, per the owner’s updated instruction. The email remains in Gmail Drafts until manually sent.

Billing company/address/contact, business details and optional printed payment instructions are editable per draft and use the existing autosave/recovery workflow. Existing drafts remain compatible. Private invoice notes, pricing evidence and internal IDs never print. Do not enter credentials or payment-card information into these fields. Confirm business registration and client contact information before sharing a PDF. New PDF details use the owner's explicitly approved newer August settlement text, including the 5% monthly compounded / 79.59% annual clause. The printed instructions remain editable.

The template follows the user's existing InDesign invoices, including its verified earlier and newer exported reference invoices: Letter paper, pale gray background, olive corner/footer and table, original logo, two-column itemization, tax and total. Live export requires the original GothamSSm Light, Medium and Bold fonts installed privately in INVOICE_FONT_DIR, named GothamSSm-Light.otf, GothamSSm-Medium.otf and GothamSSm-Bold.otf. The owner supplied the exact fonts on October 15; their internal names were verified and they were installed privately in the task workspace. They must never be committed to the public repository. The bundled SIL-OFL Liberation Sans files are exclusively synthetic-test fallback fonts; the HTTP endpoint rejects export without the private template fonts. The original invoice's client data and registration identifier are not stored in source control. The renderer supports Latin text and rejects unsupported characters explicitly. Billing details fields are bounded to eight lines, payment instructions to twelve. Longer service lists continue across pages with repeated headers.

Prices and tax are taken from the reviewed editor values, using the existing integer-cent calculation. Main photo/video/floor-plan lines include ` - property/project`, added once. Additional deliverables (IG Reel and Basic Intro Audio Walk + Talk) omit the address. Drone services remain distinct and address inclusion is explicit. Legacy prefixes require the confirmed legacy pricing profile; verbatim descriptions can opt out of automatic formatting. This export adds no pricing or floor-plan-cap changes. Existing CAD, 5% GST and Net 30 defaults remain in the draft workflow; explicit currency, tax and dates are preserved.

## Verification

- TypeScript check passed.
- All 112 tests passed using `node --import tsx --test tests/*.test.ts` (the `tsx` CLI IPC socket is restricted in this cloud environment).
- Vite production build passed.
- `pnpm audit`: no known vulnerabilities.
- Synthetic one-page and 25-line/seven-page PDFs rendered and inspected; text extraction confirmed amounts and absence of private notes.
- HTTP tests cover repeated export, current unsaved input, unchanged persisted draft state, invalid/missing/deleted drafts, excessive lines and cross-origin denial.

## Deployment

This branch is based on `codex/phase2-invoicing`, not Phase 1 `main`. Installation requires the updated lockfile, server assets/fonts and frontend build. PDF export alone needs no database migration; the email-draft integration adds a durable duplicate-prevention table. See INVOICE_EMAIL_DRAFTS.md. INVOICE_FONT_DIR must point to the privately installed, appropriately licensed original fonts. Keep font binaries private when transferring them to the host. The owner explicitly selected the newer August terms; older wording is not used. Use the established backup, staged-build and rollback procedure on the authorized host. This implementation has not been deployed or browser-accepted on the live Hub; pushing a branch alone does not activate it.

## Visual correction and source verification

The first sample was not accepted as a faithful match. Metadata underlines, table outer borders/header separator, centered prices, exact CMYK colors and original footer icons were corrected using measured export geometry. The original INDD document identity matches both reference PDFs. The owner subsequently supplied the exact GothamSSm family and selected the newer August payment terms. The corrected review PDF embeds Light, Medium and Bold, retains Net 30 dates, and has been visually checked. The owner accepted the corrected PDF design. Production host installation and live browser verification remain pending.

## Latest typography revision

The owner’s two comparison screenshots identify table-body descriptions and amounts as too large. Both are now 10pt instead of 12pt, while billing/contact and table headings remain 12pt. This matches the smaller body-row style in the newer original reference. No client pricing or invoice facts changed.
