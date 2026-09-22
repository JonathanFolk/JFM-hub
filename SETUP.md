# Connection and deployment handoff

## Two separate Google connections

The Codex Google Calendar plugin lets this task inspect calendars. Reconnect it as **jcwfolk@gmail.com**, leaving Google Drive/Gmail on **info@jonathanfolk.ca**. This does not connect the Hub's hourly background service.

The Hub needs its own Google OAuth application. Use a dedicated Google Cloud project controlled by Jonathan. Enable Google Calendar API. Configure a Web application OAuth client with an exact authorized redirect URI: `http://127.0.0.1:4312/auth/callback` for the present local preview, and later the approved HTTPS hostname followed by `/auth/callback`. Do not use a wildcard or a different port.

Because the booking account is a personal Gmail account outside Workspace, an internal-only Workspace consent application cannot authorize both identities. Configure the appropriate external/private testing audience and add both addresses as test users. Testing-mode offline authorizations can expire; production readiness and applicable verification must be resolved before claiming unattended reliability. Request only `openid email` for sign-in and `calendar.readonly` for the separate Calendar consent. No calendar edit scope is implemented. See [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [verification exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/verification-exceptions).

Place the client ID and secret in a private environment file, never in chat, browser code or source control. Generate TOKEN_ENCRYPTION_KEY using `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` in a private terminal and save it with the credentials. Keep a separate private recovery copy of this key; without it, restored Calendar credentials must be reconnected.

Restart the app with those environment variables. First sign in as info@jonathanfolk.ca; then Connections → Connect Google Calendar → jcwfolk@gmail.com. The server checks signed Google identity, verified email, audience, issuer, nonce, state/browser binding and the approved account. Calendar permission is read-only. Press Refresh, verify the jobs against a small known sample, then test a reconnect and the next scheduled refresh. No OAuth success has been claimed or tested with real credentials yet.

## Purchased OVHcloud hosting — deployment pending

Jonathan reports purchasing OVHcloud after the prepared VPS-1 / Beauharnois checkout. The purchased server specification, location and readiness must be verified in his account. Target hostname: **hub.jonathanfolk.ca**. Google production redirect: **https://hub.jonathanfolk.ca/auth/callback**. The browser is presently blocked by a failed administrator-policy check; no server access or DNS change has occurred. See HOSTING_CHECKOUT.md for the prepared order rather than assuming the purchased plan matches it.

Before provisioning or uploading: verify the chosen provider's processing/support/subprocessor terms, actual server and backup regions, log destinations, and existing Google service boundary against Jonathan's Canada-only instruction. A Canadian storage selector alone is not a guarantee that every process stays in Canada. Cloudflare proxy/CDN, overseas telemetry, external AI, Dropbox backups and remote font services are not configured. Use direct DNS and HTTPS. Provider account/payment, a hostname and the privacy verification are still needed.

Prepared examples in deploy/ have placeholders and are not installed. On the approved host, create an unprivileged jfm user, deploy code to /opt/jfm-hub, keep runtime data in /var/lib/jfm-hub, and secrets in /etc/jfm-hub.env readable only by the service administrator. Install Node 24 and pinned dependencies; build dist before starting. Allow HTTPS and admin-restricted SSH, keep the app port private, and enable systemd restart. Keep Caddy request logging disabled so OAuth callback query parameters are not written to access logs. Confirm other platform agents do not collect private data.

Before hosted acceptance: signed-out data access must fail; actual Google sign-in and a wrong-account denial must be demonstrated; a moved/cancelled/recurring booking must reconcile; hourly zero-AI sync and nightly refresh must run; failed sync must preserve last success; off-machine Canadian backup and independent outage detection must be demonstrated. Do not declare the service ready merely because localhost works.

## Restore and rollback

1. Stop the Hub process/service. Preserve the current database, WAL and SHM files as a separate incident copy; do not overwrite the sole current copy.
2. Open a selected backup with SQLite and run `PRAGMA integrity_check`. It must return `ok`. Copy it to a fresh data directory; never mix a backup database with WAL/SHM from another database.
3. Restore ownership/permissions, point DATA_DIR to the recovery directory, and start on a private local port first. Check job counts, review notes, last successful sync and several source identities. Sessions can be cleared and Google reconnected if credentials are unavailable.
4. For a code rollback, keep the prior code/dependency lockfile and its matching database backup. There are no destructive schema migrations in Phase 1. Test the pair privately before switching back.
5. After verification, resume the approved service and reconcile Google. The master Sheet and issued invoices were never changed by Phase 1. A restored snapshot may be behind; inspect changes before acting on financial candidates.

Local synthetic backup restoration has been tested. Provider recovery, cross-machine restoration, live OAuth and complete-host outage alerts are still pending. Same-datacenter backups do not cover a whole regional outage; keep an additional verified Canadian recovery copy before go-live.

## Approved multi-calendar monitoring

The private file data/calendars.json holds exactly seven calendar IDs verified through the working jcwfolk@gmail.com connector. Copy it to the approved server's private data directory and set CALENDAR_SOURCES_FILE. Never populate this list automatically from all calendars the account can see. Family, personal, holiday and unlisted contractor calendars are excluded.

Each calendar has independent event IDs, sync cursor, last-attempt/success timestamps and daily full-reconciliation state. One failed source does not block others or advance its own success timestamp. Hourly checks and parsing make zero AI calls. The primary source replaces its export when a real app sync succeeds; contractor sources retain their calendar identity, including in job detail. Entries mirrored between calendars are retained separately for review; they are not automatically merged or treated as separate billable jobs.

The connector authorization used by Codex cannot be exported into the app. Complete the app's own Google OAuth setup before claiming the hourly monitor is running. Nothing was scheduled as a recurring AI task.

## Namecheap DNS for hub.jonathanfolk.ca

Wait for OVH to deliver the VPS and verify its Canadian location and public IPv4. In Namecheap → Domain List → jonathanfolk.ca → Advanced DNS → Host Records, use Show More/search to check whether host `hub` already exists. If absent, Add New Record: type **A Record**, host **hub**, value **the verified OVH public IPv4**, TTL **Automatic**, then save with the checkmark. Do not enter the full hostname in Host or use a placeholder IP. If a hub record already exists, inspect it before replacing it or creating a conflicting duplicate.

Preserve all existing @/www website records, verification records, Google MX/TXT records and nameservers. Do not use URL forwarding. After propagation, verify the public A response, install the prepared Caddy configuration and verify HTTPS before enabling production OAuth or exposing client data. DNS alone does not deploy the application.

Reference: https://www.namecheap.com/support/knowledgebase/article/9837/46/how-to-connect-a-domain-to-a-server-or-hosting/
