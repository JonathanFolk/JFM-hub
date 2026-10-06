# Responsive layout repair — October 5, 2026

Status: deployed as `639395b` on October 5, 2026. Live April 25 booking visually verified; evidence and actions remain below readable booking content with no page overflow. See `DEPLOYMENT_OCT05.md` for release and rollback details.

## Cause and correction

The April 25, 2026 Saturday date is correct. The Complete row used three grid columns: date, flexible booking details, and an automatically sized actions column. Four Sheet links, three email links and two buttons expanded that final column, crushing the customer name into individual letters.

- Extracted `CompletedBooking` with two columns: date and booking content. Evidence and actions occupy a separate row below, so additional links cannot consume the title's width.
- Kept all invoice amounts, evidence links, View job and Reopen job controls. No completion matching or financial records changed.
- Added explicit wrapping and minimum-width safeguards for shared action groups, rates, long review/invoice subtitles, deleted-item titles and connection errors. No overflow is concealed by clipping.
- Fixed a second tablet-width Jobs bug: the Services heading was hidden while service cells remained visible. The heading and rows now use the same four tracks, hiding Suggested due together with its cells.

## Verification and prevention

- `pnpm verify`: TypeScript, 89 tests, production build and dependency audit passed.
- `pnpm test:layout`: opens a loopback-only browser regression harness at `http://127.0.0.1:4320`. All eight widths passed: 320, 390, 767, 768, 1024, 1199, 1440 and 1920 pixels.
- Synthetic fixtures exercise single invoices, four split invoices plus three email links, 40 evidence links, unbroken long text, rate selectors, connection errors and Jobs heading/cell alignment. Checks detect horizontal overflow, crushed content, overlapping evidence and controls outside their rows. No private data or API credentials are included.
- Actual isolated-preview pages checked at 390 and 1024 pixels: Overview, Jobs, Review, Invoices, Complete, Rates, Recently Deleted and Connections showed no page overflow. At 390 pixels, invoice dialog unit-price width was approximately 157 pixels, with no body overflow. Desktop completion cards were also visually checked.
- Future layout releases must run both `pnpm verify` and the browser harness, wait for all eight PASS results, and spot-check the actual preview. The browser harness is a separate acceptance check, not part of the Node-only test runner.

Scope: responsive UI defects and related shared layout risks. This is not a claim that every possible application or Google connection issue has been eliminated. Live database, calendars, emails, payments and spreadsheet cells were not modified for this repair.
