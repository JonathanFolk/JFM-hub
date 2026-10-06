# Local Hub update — September 27, 2026

Historical status on September 27: working preview only at http://127.0.0.1:4313. No push, deployment, calendar write, invoice sending or master-Sheet edit at that time. The application code was subsequently deployed October 5; see [deployment record](DEPLOYMENT_OCT05.md). The completion counts below remain local-preview results, not production counts.

## Ready to review

1. All detail popouts are centered, near-full-screen bubbles. Invoice description, quantity and unit price have explicit responsive columns; checked at desktop and 390px mobile width.
2. Invoice edits autosave after a short pause. Closing by X, backdrop or Escape flushes pending edits. A browser-local recovery copy protects the last keystroke on reload; stale server revisions are rejected. Invalid data/save errors stay visible rather than closing the editor. Ready status still requires the existing completion/pricing safeguards.
3. New drafts default to 5% GST per the owner's business instruction, with a one-click off/on toggle. Existing undecided draft tax settings were migrated to 5%; explicit no-tax decisions and ready invoices are preserved. This configures the owner's rule, not a determination of legal tax treatment.
4. Selecting Real Estate, Commercial or Other is separate from submitting. **Submit** creates/reuses the private draft and closes the bubble. **Submit + Invoice** also opens that draft in Invoices. Commercial offers the photoshoot's rate/package choices. Existing draft prices are not silently replaced.
5. A three-second **Catalogued — category** corner notification offers Undo. Undo restores the preceding classification, affected reviews and prior draft; it refuses to overwrite subsequent edits. A test classification and invoice were undone successfully.
6. Scheduled is now **Confirmed** in the user interface.
7. With the owner's explicit approval, the Rates display groups **98 rates into 44 service groups**, with Standard/Legacy and size tiers in a dropdown. All rate records, prices, IDs and provenance remain intact. **+ Add rate** opens a form with the charging unit.

## Rate duplicate review

- Repeated Premium photo, Basic photo and Video names represent size/profile variants, not duplicate charges.
- Matching Standard/Legacy amounts remain separate profile records; they may diverge later.
- Photo versus video drone/twilight services remain separate even where amounts coincide.
- Commercial exterior drone/twilight/retouching remain separate from RE add-ons.
- Interior Design S/L remain separate because deliverable terms differ. Their outstanding allowance/short-visit questions are unchanged.
- No destructive deduplication or price merging was performed.

## Master Sheet and Complete

Read the current **Jonathan Folk Media Invoicing** Sheet through the owner's business-account connector, without editing it. Inspected the 2026 headers, populated invoice rows and remaining blank range through row 993, plus a sample of archived 2025 completed/void rows.

The live 2026 data contains **202 eligible dated, positive-total invoice rows**. Voids, blank placeholders and nonnumeric amounts are not automatic completion evidence. “Stripe” is a tracking label, not a unique invoice number. A checked Paid box by itself does not establish an invoice match.

The first conservative pass moved **14 uniquely matched jobs** into the preview's new **Complete** section: **13 Paid, 1 Payment outstanding**. Matches require the exact normalized client and full street/unit address, invoice date on/after the shoot within 90 days, and no competing row/job match. Ambiguous names, street-only notes, grouped invoices, missing units and date conflicts stay in Review. This is not an assertion that all remaining old jobs are unbilled.

Each completion retains its Sheet row link, date checked, invoice/total/payment evidence and match reason. Reopen job returns it to the active workflow. Existing drafts/history are retained, not erased. Paid status is a dated Sheet snapshot, not a live bank or email-delivery check. The preview's background Google connections remain disabled; this read does not repair the hosted Hub's separate OAuth/Sheets connection.

Private source snapshot and recovery backups stay in ignored `data/local-preview/`. The original `data/hub.sqlite` checksum remains unchanged.

### Paid-invoice follow-up

Re-read the 2026 master Sheet (C7:K350, with C351:K993 checked empty): 193 eligible paid rows. Added a paid-only matching pass that normalizes unit placement, street abbreviations and city suffix formatting while preserving house/unit identity. It still requires an exact client, one unambiguous invoice/booking match and an invoice date on/after the shoot within 90 days. Unpaid, partial/deposit, cancellation-charge, rebilling, competing-visit and manually reopened cases are not auto-completed.

Moved **7 additional paid bookings** into Complete in the isolated preview, for **21 complete (20 Paid, 1 Payment outstanding)**. Each stores its source Sheet row and read time. The seven were not open Review items, so the open-review count remains **137**. Shorthand-address matching is awaiting the owner's choice; no fuzzy client, missing-unit or bundled-project guesses were applied.

`scripts/complete-paid-preview.ts` is a read-only dry run unless passed `--apply`; it uses the private `master-sheet-paid-refresh.json` snapshot, creates a backup before changes and skips existing completions/manual reopen decisions. Re-running after the update finds zero new matches. The current source jobs, reviews and invoice drafts were verified byte-for-byte unchanged; dashboard filtering removes completed jobs' ordinary reviews without erasing history. No background Sheet automation was enabled.

### Email-thread reconciliation — September 27 follow-up

Following the owner's direction, read invoice/delivery conversations in the business Gmail account and refreshed the master Sheet's Paid checkboxes. Email evidence bridges full project addresses to invoice numbers, including bundled photo/video/floor-plan work, split billing, revised invoices and differing client/billing names. Inspected full PDF contents where filenames were incorrect. Gmail, Calendar and Sheets were not modified.

- Applied **72 additional paid booking completions** across 57 audited project/service mappings. **93 bookings are now Complete** (92 Paid, plus the existing payment-outstanding record from the earlier policy).
- Removed **31 ordinary Review items covering 29 bookings** through the existing completion filter: **137 → 106 Review items**, representing 94 bookings. Their underlying review/history records and invoice drafts remain intact.
- Remaining reviewed-queue bookings: **29 Cancelled, 8 future, 57 past unresolved**. “Unresolved” means not yet conclusively reconciled, not necessarily unpaid. No percentage-based blanket completion was applied.
- Examples verified: Hudson and Woodland photo/video teams; Kerr photo/video/drone return; The Current's two homes and neighborhood work; Forma's three units and both split invoices; Luminary's legal billing name; Granville's two addresses; JMS's split rebill retained under its aggregate Sheet entry.
- Earlier rescheduled Homer, Elgin and W13th records are linked to the settled project, explicitly without claiming their original proposed appointment happened. Cancelled records were excluded.
- Complete now shows the project address, original booking title, all linked Sheet rows/invoices, Gmail evidence links and the reason. Reopen remains available. Evidence is a dated read-only snapshot, not background payment monitoring.
- Fabric/The Cut photography is paid but separate virtual staging is unchecked; Clements has an unchecked BCG share. Left these mixed-payment projects active. Prima's August invoice and Adil's Union/Winch entries are also unchecked.
- Awaiting owner confirmation: Supernova booking/delivery says **805 Prospect St**, while paid Kuna invoice **26090** and the Sheet say **905 Prospect St**. The delivery thread explicitly requests billing Kuna; its two bookings remain pending the address clarification.

Private evidence lives in ignored `data/local-preview/email-invoice-*.json`, downloaded invoice PDFs and `email-completion-approved.json`. `scripts/audit-email-completion.ts` only lists candidates; it does not authorize completion. `scripts/complete-email-preview.ts` applies only the explicit audited mapping, requires every referenced Sheet row to be paid, validates invoice identity/date, rejects cancelled/future/conflicting jobs and skips deleted, completed or manually reopened jobs. It defaults to dry-run and cannot target the live database. Backup before this pass: `data/local-preview/before-email-completion-1790540780953.sqlite`.

Verified repeat application produces zero new matches, the local API reports 93 Complete / 106 Review items, and jobs/drafts/reviews/trash are byte-for-byte unchanged. Source database checksum unchanged. The browser was refreshed to the rebuilt isolated UI and Hudson's two Complete entries and email/Sheet links were visually verified. No deployment or push.

## Approved cancellation policy — implemented locally

Auto-move to Recently Deleted only after Google's successful read explicitly reports `status: cancelled` for a known calendar/event identity. A recurring cancellation affects only that occurrence. Jobs with any existing invoice draft (including ready drafts) or Complete record stay protected and receive a **Calendar cancellation** review. A linked floor-plan booking is also protected when its parent has a financial record. Existing invoice amounts, payment evidence and completion records remain unchanged.

Never infer deletion from a missing bounded-sync result, old age, HOLD/TBD wording, changed titles, moved events, API errors, lost calendar access or an expired cursor. ICS/manual imports do not authorize auto-trash. Previously cancelled jobs are not retrospectively trashed without explicit Google evidence.

Source/event identity, observation time, outcome and an audit entry are retained. Normal restore remains available; repeated tombstones do not re-trash restored jobs or reopen an acknowledged cancellation review. A subsequent confirmed/tentative Google event resets that guard for a genuinely new cancellation. Completed jobs remain in Complete, with their cancellation alert visible in Review.

Verified using synthetic in-memory bookings. Background Google sync remains disabled in the isolated preview; no live bookings were deleted or modified.

## Verification

- 69 automated workflow/HTTP/calculation/recovery tests, plus TypeScript checks, including paid matching, audited multi-booking/split-invoice evidence, cancellation protection, restore/replay safety and completed-job review visibility; production build and dependency audit.
- Browser: desktop/mobile bubble, readable price field, immediate close/reopen autosave, GST off/on totals, commercial Submit + Invoice, three-second Undo, grouped rates and Complete evidence.
- Test note/add-on/classification changes were removed or undone; no client-facing output was sent.
