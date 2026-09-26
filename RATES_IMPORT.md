# 2026 Q2 rate import

The supplied `Indesign PDF Rates 2.zip` contains four one-page PDFs. The two sheets without `Legacy` in the title provide 43 Standard fixed-price rows. The two Legacy sheets provide 44 fixed-price rows for clients whose pricing profile is confirmed Legacy. Both catalogs are transcribed in `server/approved-rates.ts` and seed the Hub's SQLite `rates` table when the application opens. The owner confirmed the sheets' `$` amounts are CAD. The separate reference archive established that Legacy pricing still applies to listed clients; neither catalog is automatically selected from a calendar name.

The original PDFs are copied to ignored `data/rates-source/` so the local source can be reviewed without checking business pricing PDFs into Git. SHA-256 checksums of the active PDFs are:

- Photo, 2026 Q2: `0b1fe728a3e9f83f4059f11f42662189ae73162f314e379e3e0a0917fd27e2e8`
- Video, 2026 Q2a: `d8a1d35a5e2c146476167da6170f755f4a9aa79c584dc191329e6c1f96d85cdf`

The Standard source lists premium photo at CAD $850 for 6,001–7,500 sq ft; Legacy lists CAD $650. Both adjacent `+7001 sqft` custom-quote lines were confirmed by the owner to mean **7,501+ sq ft**. The owner expects approximately CAD $1,000–$1,250 for Standard work in that larger tier, but it is guidance only; the invoice must use a confirmed custom amount.

The printed tiers leave exact 1,000 and 2,500 sq ft boundary values unspecified. Those values prompt manual confirmation. Basic photo above 5,500 sq ft, video above 7,500 sq ft, floor plans, and ambiguous drone/twilight packages also require a confirmed price. Contact-for-quote entries have no fixed rate. Add-on amounts retain their per-image, per-service or per-deliverable unit labels.

Rate suggestions require a manually confirmed Standard or Legacy profile, exact category, service and currency match, and the whole selected square-footage band must fit inside a published priced tier. Suggestions are never applied without a user action. Tax and invoice readiness checks remain separate. The six reference CSVs from `jfm hub claude.zip` were imported into ignored `data/hub.sqlite` on this Mac. Its source archive SHA-256 is `4c9f1ee01ba507e3eecd03e191b4d5c181254c804c9959fe58555d14406c6e5b`. The obsolete spec file was not used. Observed prices and disputed matches are not approved rates; see `PRICING_REVIEW.md`.
