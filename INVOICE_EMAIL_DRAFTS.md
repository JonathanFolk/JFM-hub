# Review-only invoice email drafts

The invoice editor can prepare a named PDF and a separate Gmail draft from the owner's verified template. The original blank Gmail template is never modified. Recipients are entered and reviewed explicitly; multiple unique To/Cc correspondents use “team” (excluding the business sender). A single correspondent requires a greeting name. References retain letter suffixes. The attachment name is `[Client or billing entity] - Invoice [reference] - Jonathan Folk Media.pdf`; the PDF is send-ready with no review or reservation remarks. Gmail Drafts is the review boundary; the user can send directly there.

The private template contains `subject`, `body` and `html` strings in JSON. Subject and the three original greeting/location/net-day placeholders are validated. HTML signature markup is preserved and inserted values are HTML-escaped. Configure `INVOICE_EMAIL_TEMPLATE_FILE` outside the repository and static directory. Do not put original email exports, private customer details or the private font pack into public git.

## Deployment and explicit connection

1. Back up the existing application database and install the reviewed source on the authorized host using its existing deployment procedure. Install original fonts privately and set `INVOICE_FONT_DIR` as described in PDF_EXPORT.md. Install the verified template JSON privately and set `INVOICE_EMAIL_TEMPLATE_FILE`. Restart using the established service procedure.
2. The server creates an additive `invoice_email_drafts` table. Existing invoices and read-only integration settings remain intact. Back up this table with the application database; its records prevent duplicate drafts.
3. Once private assets and template are configured, the invoice UI exposes **Connect Gmail drafts with Google**, which opens `/auth/start?kind=gmail-drafts`. This uses the existing Google OAuth client and callback, requests `openid email https://www.googleapis.com/auth/gmail.compose`, and stores the returned grant separately from Gmail read-only access. The business-account restriction and existing PKCE/state/nonce checks remain in force.
4. The owner must explicitly approve the Google consent screen at action time. Google's scope permits managing drafts and sending mail; Gmail has no narrower draft-create scope. The Hub implementation calls only the drafts create/read endpoints and implements no send action. Do not silently upgrade the existing read-only grant or pre-authorize consent. If Google requires additional app configuration/verification, pause for the owner rather than expanding grants or altering security settings.
5. After connection, prepare a synthetic review draft and confirm its recipients, subject, MIME attachment and Gmail Drafts state. Sending remains a manual Gmail action. Live OAuth and production delivery have not been exercised by local tests.

## Duplicate protection and review

A durable per-invoice claim is recorded before the Gmail request. Concurrent clicks cannot create two drafts. Repeated identical requests verify the existing draft and preserve any Gmail edits. Changed invoices are not silently copied over an existing draft. A draft that was sent/deleted is not recreated. Timeouts and uncertain results block retries: review Gmail and the stored attempt before an operator deliberately resolves it. Definite 4xx rejections permit a new explicit click after correcting the connection or recipients, using an atomic claim; there are no automatic network retries. There is no automated reset/delete/retry endpoint. Restoring an old database backup can lose newer claims, so reconcile Gmail before resuming draft creation after restoration.

Success is announced in the invoice UI with a link to Gmail Drafts. No automatic client email or background notification is sent. Tests use synthetic recipients and mocked Gmail, never real drafts or credentials.

Google references checked: [draft creation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create) and [OAuth scope descriptions](https://developers.google.com/workspace/gmail/api/auth/scopes).
