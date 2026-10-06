# Next update: review, calendar and invoicing quality of life

Status: **Historical local-preview review plan. Deployment authorized October 5; see [deployment record](DEPLOYMENT_OCT05.md).**
Prepared: September 26, 2026. Based on the current repository, supplied screenshots and requested rates.

Goal: make the review list easier to scan, use calendar evidence to reduce manual sorting, and prepare accurate private invoice drafts. This was initially a review-only plan. Jonathan subsequently requested a full working preview on an isolated data copy and authorized a read-only copy of live bookings.

Preview: http://127.0.0.1:4313 (`pnpm preview`). UI, sorting, rate/add-on selection, invoice editing, recovery and evidence rules now run locally against `data/local-preview/hub.sqlite`. The copy contains 259 bookings and the existing draft; clear saved areas generated 13 additional local drafts. Production and the original local database remain unchanged. No push or deployment has occurred. See [preview instructions](preview/README.md).

Before live release: resolve the pricing/terms questions below, verify the new calendar's actual access and identity, and diagnose the hosted Sheet response. Google connections are disabled in the preview. Calendar sync and error handling have automated coverage but are not live-integration acceptance results. The following numbered sections remain the review/acceptance checklist, including descriptions of the pre-update behavior.

## 1. Diagnose the master Sheet connection first

**What the evidence establishes:** the sharing screenshot shows `info@jonathanfolk.ca` owns “Jonathan Folk Media Invoicing.” The code authorizes that business account separately from Calendar and requests `spreadsheets.readonly`. In `server/invoicing-sheet.ts`, every HTTP 403 becomes “The connected business account cannot read the master Sheet. Reconnect or check sharing.” The Google error body is discarded, so this message does not establish a sharing problem. Production credentials, configuration and the underlying Google response were not inspected for this review; the root cause remains unconfirmed.

Execution steps:

1. Reproduce the read through the deployed Hub's Sheets connection and capture only the sanitized Google error status/reason/message; never log tokens or spreadsheet contents.
2. Verify the deployed `INVOICING_SPREADSHEET_ID` points to the file in the screenshot, and the stored `sheets-account` is `info@jonathanfolk.ca`. A working chat/Drive connection does not prove the Hub's separate authorization works.
3. Check that Google Sheets API is enabled in the Cloud project owning the Hub's OAuth client. Google lists API enablement as a prerequisite in its [Sheets setup guide](https://developers.google.com/workspace/sheets/api/quickstart/nodejs).
4. Check the actual granted read-only scope, token refresh and any Workspace app-access restriction. Reconnect **master Sheet** as the business account if consent/token evidence calls for it; reconnecting Gmail or Calendar is a separate operation. See [Google's Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes).
5. Check sharing only if the response identifies file access as the problem. Ownership already supports access for the pictured business account; making the Sheet public is unnecessary.
6. After access succeeds, validate the existing read range `'2026'!D5:J` and expected `Inv #`, `Client`, `Total`, `Paid` headers. A range/header problem is separate from the current 403.
7. Give Connections specific actionable errors for API disabled, insufficient scope, file access denied, expired authorization and temporary failures. Preserve the last successful sync and distinguish “authorized” from “last read succeeded.”

Acceptance: the Hub reads the expected 2026 rows, invoice-evidence sync succeeds, and the hourly check remains enabled after initial manual sync. The “Read-only Gmail and master Sheet” text describes the connection boundary; it is not another error. No payment status or spreadsheet cells change.

## 2. Introduce the supplied palette and left-side status ribbons

Use shared CSS tokens, beginning with navigation, controls and review/job labels. Retain light neutral surfaces for readable lists.

| Colour | Exact hex | Proposed use |
| --- | --- | --- |
| Icy Aqua | `#ADFCF9` | Review-needed ribbon and selected highlights; dark text |
| Muted Teal | `#89A894` | Scheduled booking ribbon; dark text |
| Hunter Green | `#4B644A` | Primary actions and reviewed/ready ribbon; light text |
| Deep Mocha | `#49393B` | Unconfirmed ribbon and secondary emphasis; light text |
| Dark Coffee | `#341C1C` | Primary text and cancelled/dismissed ribbon; light text on ribbon |

1. Move labels such as **Check booking** out of the subtitle into a compact coloured ribbon on the left of each Review row.
2. Preserve the distinction between issue type, review state and booking state: for example, a left label can read `Check booking · Review` or `Check booking · Reviewed`; an unconfirmed booking remains visibly `Unconfirmed`. Reviewing an issue does not mean a shoot occurred or an invoice is ready.
3. Remove the redundant right-hand **Status** column from Review. Keep the row-open affordance and existing filters; use the same ribbon convention for job status where applicable.
4. Place a compact **Status legend** immediately below the Review/Jobs filter bar, expandable on small screens. Explain each colour with text; never rely on colour alone.
5. Check text contrast, keyboard focus, 200% zoom, mobile wrapping and light/dark label combinations before accepting the design.

Acceptance: status can be understood without colour, the subtitle is available for the address, and desktop/mobile rows have no redundant status column or overflow.

## 3. Show street address + city in the Review subtitle

1. Use the linked Google Calendar event's location for `street address, city`, retaining unit/suite numbers. Example: `123 Main St, Vancouver`.
2. Omit province, postal code and country from the list subtitle only. Keep the original full location in job details and source history; do not rename the Google event.
3. If location is missing, use an unambiguous address explicitly present in calendar notes. Do not invent a city or guess an address from unrelated text. Show `Address needs confirmation` when necessary.
4. Keep the client/title as the main line and existing Ordered/Calendar information. Include address in Review search and accessible row labels. Evidence-only rows without a booking retain their own evidence subtitle.

Acceptance: a long review list shows recognisable street/city subtitles, including suite addresses, with a clear fallback for incomplete locations.

## 4. Use a rolling calendar window and import notes

1. Change full Calendar API reads from the current calendar-year-through-next-year range to **14 days back and six calendar months forward**, calculated in `America/Vancouver`.
2. Keep hourly incremental checks and a daily bounded full refresh so events entering the future window are discovered. Google disallows `timeMin`/`timeMax` together with `syncToken`; apply the window to full reads and handle incremental results locally. See [Calendar events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
3. Import event descriptions from Google and ICS into the booking evidence model. Currently `RawEvent` and both import paths omit them. Treat notes as plain source text and retain provenance for extracted fields.
4. Update `Store.apply` before narrowing the window: an older retained booking absent from a bounded response must not generate a false **Missing from source** review. Preserve historical jobs, drafts and Recently Deleted records. Retain updates/cancellations for known jobs; exclude unrelated new jobs outside the active window.
5. For a known event missing inside the window, check whether it moved outside the range before flagging disappearance. Handle pagination, recurring exceptions and expired sync tokens without erasing historical Hub records. Reset/rebuild sync cursors when the window policy changes.

Acceptance: the rolling window advances across month/DST boundaries, moved and cancelled events remain traceable, older backlog is retained, and a bounded refresh does not flood Review with false missing-booking items. Measure request/page counts before and after.

## 5. Add 3D Elevate floor-plan evidence and match bookings

1. Verify read access to `threedeelevate@gmail.com` through the existing booking account. Add it to the private calendar allowlist if absent; if already present under a calendar ID/alias, update that source rather than importing twice.
2. Add a source-specific title rule for **FP for Jon** and **FP for J**, case-insensitive with normal spacing/punctuation variations. Do not treat every `FP` event or every letter `J` as a Jonathan booking. The current general contractor rule accepts `For J`, but not `For Jon`.
3. Match against existing bookings using normalised street/unit/city, shoot date/time and supporting client or note evidence. Preserve unit numbers and distinguish repeat visits at the same property. A unique exact address/date match can link automatically; fuzzy, rescheduled or multiple candidates stay in Review.
4. Link the floor-plan source event to the existing booking as supporting service evidence, preserving both event identities. Do not create a second client invoice for the same job. Record who performed the service separately from the billing client.
5. Leave unmatched eligible events visible for review. Repeated syncs must not duplicate links or floor-plan lines. Calendar notes alone do not establish an agreed floor-plan price.

Acceptance: `FP for Jon` and `FP for J` link correctly; unrelated contractor events are excluded; two units at the same street address and repeat visits are not merged accidentally.

## 6. Label provisional bookings Unconfirmed

1. Recognise booking markers `HOLD`, `TENTATIVE`, `WEATHER`, `TBR`, `TBD`, reschedule markers and a small explicit list of common typos, including the existing `RESCHEUDLE` spelling.
2. Display **Unconfirmed** consistently in Jobs, Overview and relevant Review labels, retaining the original marker in details. Recognise markers at meaningful title positions; incidental prose such as “weather was fine” must not change status.
3. Give cancellation precedence. Re-evaluate status when the source removes a provisional marker, preserving any separate unresolved review issues.
4. Do not auto-route provisional/cancelled jobs into invoicing or treat their dates as proof of completion. Flag an existing draft for review if its booking becomes unconfirmed.

Acceptance: all requested markers avoid Scheduled/Booked presentation and automatic draft creation, while an ordinary confirmed booking still works normally.

## 7. Simplify the RE package / square-footage dropdown

Rename the control to **Real Estate package / size**. Display this exact order:

1. Up to 5 images only
2. Up to 10 images only
3. Under 1,000 sq ft
4. Under 2,500 sq ft
5. 2,501–3,500 sq ft
6. 3,501–4,500 sq ft
7. 4,501–5,500 sq ft
8. 5,501–6,000 sq ft
9. 6,001–7,000 sq ft
10. 7,001–7,500 sq ft
11. Over 7,500 sq ft

Implementation steps:

1. Remove standalone `1,000 sq ft`, `1,001–2,499 sq ft` and `2,500 sq ft` options. Separate image-package identity from numeric area in storage; image counts are not square footage.
2. Map image-only choices to Editorial/Premium packages: **$200 up to 5 images** and **$300 up to 10 images** in the supplied Standard sheet. Replace the corresponding generic photo line instead of charging both a package and a full-property photo tier. Preserve separately ordered services.
3. Continue choosing Basic versus Premium from the ordered service, not from the size label. Standard Basic rates remain $225 / $255 / $310 / $340 / $380 through the published tiers, then custom above 5,500. Premium remains $350 / $450 / $550 / $700 / $850 through 7,500, then custom. The retained larger UI bands map to the appropriate service-specific priced tier.
4. Preserve Standard/Legacy selection and client/invoice/line overrides. Keep the prior owner clarification that the printed `+7001` custom tier means **7,501+**. Do not change video rates or existing custom quotes as a side effect.
5. Migrate saved selections without silently repricing invoices. Preserve exact area evidence even when the displayed label becomes broader. Keep image-package photo pricing independent of any area needed for video/floor plans.

**Boundary decision for review:** the sheets leave Basic exactly 1,000 and Premium/video exactly 2,500 unclear. Proposed operational buckets are ≤1,000 and 1,001–2,500 while retaining the requested “Under” labels. Confirm inclusive pricing before automatic assignment at those values; until then keep a price-review flag without restoring the extra dropdown options. Manually choosing Under 2,500 without exact area must not silently choose between the two Basic tiers.

Acceptance: the menu matches the list above, both image packages work, tier edges receive the correct service/profile price, and saved drafts retain their amounts.

## 8. Replace Design with a Commercial subtype dropdown

Keep top-level **Real Estate**, **Commercial** and **Other** buttons. Commercial opens:

| Subtype | Requested pricing / behaviour |
| --- | --- |
| Developer Residential | $750 staged; $350 vacant. Require staged/vacant choice. |
| Commercial Exterior | Use the component rates below. |
| Interior Design S | $750 short visit; $1,250 for 4 hours on site; no image cap. |
| Interior Design L | $750 short visit up to 20 images; $1,250 for 4 hours up to 30 images. Image-cap conflict requires the decision below. Align Interior Design is a supplied example, not a name-only classification rule. |
| Misc Commercial | Fully custom quote and line items. |

Commercial Exterior rate entries, proposed in CAD before existing tax handling:

| Component | Amount / unit |
| --- | --- |
| Architectural-style on-site base | $450 / shoot |
| After-hours twilight | +$150 / shoot when requested |
| Edited deliverable, excluding object-removal Photoshop | $20 / image |
| Advanced Photoshop retouching | +$25 / affected image, additional to normal editing |
| Drone launch — DJI Mavic 4 Pro Telephoto Series | +$200 / launch; includes complimentary Transport Canada airspace unlocking (NAV Canada / ATC) |

A 5–10-image shoot is **$550–$650 without twilight**, or **$700–$800 with twilight**, before drone, advanced retouching and taxes. The quoted $700–$800 example therefore includes twilight; it is not a separate flat package. Drone/retouching are added only when required.

1. Store subtype and package separately; require image quantities where billed per image. Keep the $150 commercial twilight rate distinct from RE twilight packages.
2. Add the supplied commercial rates with source/date provenance after review. Do not derive additional commercial Legacy discounts, full-day prices or overage fees from unrelated reference invoices.
3. Remove the Design button. Migrate existing Design records into Commercial with subtype pending review unless saved evidence establishes S/L. Preserve draft prices, history and existing commercial video rates.
4. Keep Other available for product, weddings, sports and miscellaneous custom jobs.

Acceptance: each subtype shows only relevant packages/components; custom work remains editable and historic Design jobs remain accessible.

## 9. Auto-route clear RE bookings and prepare invoice add-ons

**Current code finding:** sorting a Booked job already creates/reuses one private draft and copies the selected area band. Parsed services create draft lines at **$0**. Matching prices are suggested and applied manually; generic `Drone` and `Twilight` intentionally require package selection. Calendar-description extraction and automatic pricing are not currently active.

1. Extract explicit RE area from titles/descriptions, including `2,400 sqft`, `2400 sq ft`, `2400sf` and `2.4k sqft`. Preserve source/value and distinguish house area from lot, garage or multiple-property figures. Conflicting or vague values remain in Review.
2. For an identified RE booking with a confirmed booking status and unambiguous required details, assign the package/area and create or enrich its private draft in Invoices. Mark only the resolved sorting/area review as handled; preserve unrelated billing, service and changed-booking issues. Incomplete jobs can receive a suggested area without disappearing from Review.
3. Populate new draft lines with exact approved prices when service, package, quantity, currency and Standard/Legacy profile resolve uniquely. This is a proposed extension beyond today's manual price application. Record the rate/source used and keep custom or ambiguous lines visibly awaiting a price.
4. Provide a searchable **Add service** picker from all saved applicable rates, with unit, quantity, profile and price shown before adding. Include existing video add-ons as well as these Standard photo services:

| Saved add-on | Standard price |
| --- | --- |
| Premium shots add-on | $150 / job, 5–10 images |
| Virtual staging | $30 / image |
| Essentials aerial drone (<6 photos) | $200 / job |
| Full aerial drone (<15 photos) | $350 / job |
| Standalone aerial drone photo visit | $100 / job |
| Golden/twilight photo add-on | $225 / job |
| Golden/twilight exterior-only photo | $200 / job |
| Rush expedited delivery | $75 / service, 24 hours subject to availability |
| Image retouching | $25 / image |
| Floor plans, neighbourhood photos, travel | Confirmed custom quote |

5. Extract explicitly requested add-ons from titles and notes. Auto-price a specified approved drone package; a bare `DR`/`drone` request adds a package-to-confirm line. Do not infer drone from “exterior,” choose an image count, or charge every optional service mentioned in a template. Floor-plan evidence from 3D Elevate must not invent a client rate or contractor fee.
6. Deduplicate services across primary and linked contractor events. Treat separately billable repeat visits as separate work. Keep an audit trail and preserve edited lines, manual overrides and ready drafts during repeat sync; changed evidence should prompt review rather than overwrite them.
7. Completion confirmation, tax review and Ready validation remain required. Future bookings may have planning drafts, but nothing is issued, sent or marked paid automatically.

Acceptance: a clear RE booking with area plus an explicit drone package reaches Invoices with correct draft lines and prices; a generic drone request waits for package selection; a repeat sync adds nothing twice. Missing/conflicting evidence and unrelated review tasks remain visible.

## 10. Replace delete wording with a trash icon

Replace “Delete to Recently Deleted” in both Review and job details with a trash-bin icon button. Supply an accessible name and tooltip such as **Move to Recently Deleted**, with a touch-friendly target. Preserve recoverable deletion, restoration, linked-record handling and the protection against calendar reimport resurrecting deleted items.

Acceptance: the icon is understandable with keyboard/screen reader use, and restore returns the same job and draft.

## Decisions to resolve during document review

1. **RE boundaries:** approve or revise the inclusive 1,000/2,500 operational buckets described in step 7.
2. **Interior Design L:** the request gives 20/30-image limits and also says “no image cap.” Confirm whether those are included-image allowances with paid extras, hard caps, or uncapped delivery. Supply an overage rate only if applicable.
3. **Commercial package details:** confirm short-visit duration, any additional existing packages to carry over, effective date and Standard/Legacy applicability. The supplied $750/$1,250 amounts are recorded; the previously observed $1,800 full-day price remains reference evidence until confirmed.
4. **Overlapping projects:** the sentence “if there are other overlap projects handled by” was cut off. Confirm the intended contractor(s) and billing rule. Address/service linking and duplicate prevention are covered; fee splits, bundled discounts or extra contractor charges are not assumed.

## Execution and release checks after review

1. Resolve the decisions relevant to each step; take a database recovery copy before schema/data migrations.
2. Execute steps 1–10, with calendar evidence and service/rate modelling in place before enabling automatic draft enrichment. Update hard-coded seven-calendar readiness/setup expectations if the allowlist expands.
3. Add targeted synthetic coverage for matching, provisional markers, range edges, note extraction, duplicate suppression, price/profile selection, preservation of edits, bounded sync and distinct Sheets errors. Run the repository's required `pnpm verify` checks.
4. Review desktop/mobile list layouts and the status legend. Check representative private bookings and draft calculations, then verify restore/migration behaviour on a database copy.
5. Present the implementation for review before deployment. Update `README.md`, `PHASE2.md`, `SETUP.md` and affected pricing documentation to match the accepted behaviour; retain earlier completion records as history.

Implementation map: `src/main.tsx`, `src/WorkflowPanels.tsx`, `src/review-display.ts`, `src/style.css`; `server/types.ts`, `server/parser.ts`, `server/calendar.ts`, `server/calendar-sources.ts`, `server/sync.ts`, `server/store.ts`; `server/approved-rates.ts`, `server/rates.ts`, `server/invoicing.ts`, `server/index.ts`; `server/auth.ts`, `server/invoicing-sheet.ts`, `server/reconciliation.ts`; associated tests and `scripts/readiness.ts`.
