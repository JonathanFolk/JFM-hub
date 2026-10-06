# Working local Hub preview

The [September 27 update](../LOCAL_UPDATE_SEP27.md) is included: spacious centered dialogs, invoice autosave, default GST, revised submission and Undo, grouped rate variants, and 14 verified Sheet-backed completions. The master Sheet was read through a separate connector; the preview itself still has no live Google credentials.

Run `pnpm preview` from the repository root and open http://127.0.0.1:4313.

The first run creates `data/local-preview/hub.sqlite` using SQLite's backup API against a read-only connection to `data/hub.sqlite`. Future runs reuse the preview copy, so your preview edits persist. The source database and hosted website are unchanged.

The preview uses the actual updated Hub frontend and backend: Review sorting, Commercial packages, rate selection, saved add-ons, invoice editing, review decisions, trash and restore all work against the separate copy. Background scheduling and Google sign-in are disabled, and copied Calendar/Gmail/Sheets refresh tokens and sessions are removed. Build output and backups also stay under `data/local-preview/`.

With Jonathan's permission, this preview was populated on September 26 with a read-only copy of 259 live bookings and one existing draft. The updated rules prepared 13 additional local drafts from clear saved square footage. The copy excludes production sessions and OAuth credentials. Your original local database is also unchanged.

The snapshot may lack event descriptions because the previous importer did not retain them. Notes extraction and floor-plan matching work on available copied evidence; fresh calendar notes and bounded synchronization cannot be exercised against Google while preview connections are disabled. This preview does not repair or verify the hosted master-Sheet connection; its improved error classification is covered by tests.

RE exact-boundary pricing, Interior Design L allowances and unspecified commercial terms remain review items. Existing draft amounts are preserved. No push, deployment, invoice delivery, payment update or spreadsheet write is performed.

Stop with Ctrl+C. Restarting `pnpm preview` keeps your saved preview changes. Do not copy this token-free preview database over production.
