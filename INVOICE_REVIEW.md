# Private invoice review

The Invoices page reads Gmail drafts through the existing `gmail.readonly` connection. It shows current To, Cc, subject, plain-text body, and the PDF attachment stored in that Gmail draft. The inline PDF endpoint re-reads Gmail and rejects an outdated review version. Request changes saves a note in the private Hub database. It does not update, send, or recreate a Gmail draft, or mark an invoice sent or paid.

Set `INVOICE_REVIEW_MAPPING_FILE` to an absolute path outside the Git checkout. The file is a private JSON array. Each row needs `number`, `draftId`, `threadId`, and the original `draftMessageId`. New drafts created by Hub are linked automatically after Gmail confirms creation. Do not commit this file or client details.

On opening Invoices and every five minutes while it remains open, Hub also pages through Gmail drafts with PDF attachments. It recognizes only JFM invoice PDF filenames and checks the sent media-delivery thread. Newly discovered IDs and their initial versions are retained in the private Hub database so an edited, missing, deleted, or possibly sent draft remains visible. Manual mappings and Hub-created links take precedence and are not duplicated. Two drafts using the same invoice number, multiple invoice PDFs, a changed invoice number/thread, or an unverified delivery message are flagged for manual association; Hub does not select a client project automatically. If Gmail reports more than ten 100-item pages, the scan is marked incomplete and no draft is marked ready from a potentially incomplete duplicate check.

The prepared-draft flow requires a sent media-delivery message chosen from read-only Gmail search. Hub verifies that message again, then creates a reply with the matching thread ID and subject, plus `In-Reply-To` and `References` headers. The final Send action remains in Gmail. Existing mapped drafts are only read; their edits are never overwritten.

The queue can use a matching Hub invoice or the read-only 2026 master Sheet for client and total. If a field cannot be verified, the UI says so. The PDF and email contents always come from the current Gmail draft. A missing draft and a possible sent message remain review states, not accounting states.

Deployment still requires the private mapping file, existing read-only Gmail and Sheets connections, private invoice fonts, private email template, and host configuration. Verify all six current drafts in the destination Gmail account before relying on this queue. No OAuth grant, production deployment, or publication is performed by this change.
