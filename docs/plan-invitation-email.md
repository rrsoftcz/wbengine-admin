# Invitation by email

An optional way to hand an invitation to a new user: the Admin sends one email through an SMTP server (a Google account or Google Workspace in the first deployment). Everything else stays as it is today. Without the configuration nothing changes.

## Decision

- The mail is only a delivery channel for the existing invitation. No new flow, no new table, no migration.
- One message with a welcome text, the link to `/accept` and the one-time token.
- The administrator still sees the token on the screen, exactly as today. The screen is also the fallback when the mail fails. Hiding the token was considered and rejected: a global admin can switch the mail off or issue a recovery for any account anyway, so hiding would add no protection.
- Support is optional and off by default. The mail is used very rarely (users are added once and then possibly nothing for a year), and only as a function of the Admin, not as a service.

Considered and rejected:

- A link-only mail with the code sent separately or after a confirmation step (a two-step accept flow). It needs new database state, attempt limits and rate limits for a small gain, because mail scanners cannot spend the token anyway (accepting is a POST with a password).
- A system mail tool (msmtp, Postfix, ssmtp) called through `sendmail`. The Admin runs in a Docker container that cannot see tools installed on the host, so it would need an image change, a mounted configuration file with exact permissions and a file kept outside the deployed directory. An SMTP client library in the application keeps the host untouched, deploys like any other change and reports the real cause of a failure (authentication, rejected recipient) instead of an exit code. A `sendmail` transport can be added later (the library supports it) if someone needs a local MTA.

## Configuration

Set in the `.env` file of the deployment (on the server: `/opt/wbengine-admin/.env`, mode `0600`, never in Git) and passed to the container by `compose.yaml`.

| Variable | Meaning |
|----------|---------|
| `MAIL_SMTP_HOST` | SMTP server, for Google `smtp.gmail.com`. Empty or unset: the feature is off. |
| `MAIL_SMTP_PORT` | `587` (STARTTLS, default) or `465` (TLS from the start). |
| `MAIL_SMTP_USER` | The account used to log in, for Google the full address. |
| `MAIL_SMTP_PASSWORD` | For Google an app password, never the account password. |
| `MAIL_FROM` | Sender address. For Google it must be the account or a verified "Send mail as" alias, otherwise Google rewrites it. |
| `ORIGIN` | Already required. The link in the mail is built from it, never from the `Host` header. |

The feature is on only when host, user, password and sender are all set. A partly filled configuration disables it and logs one warning at start. `.env.example` gets empty placeholders and `compose.yaml` passes the variables with an empty default, so an installation without mail starts as before.

## Behaviour

- The page `/users` receives a boolean `mailEnabled` from its load function. Only then the second submit button "Create and send by email" is rendered next to the existing one.
- The action `invite` reads which button was pressed. It creates the invitation as today. When the mail was requested, it sends it after the transaction has committed.
- Result of the action: the existing `invited` object plus `mail: 'sent' | 'failed'` and a short reason code (`auth`, `recipient`, `connection`, `timeout`, `other`). The page keeps showing the token and adds a notice: "Email sent" or "Sending failed (reason), pass the token on manually".
- A failed send never fails the invitation and never throws to the user. The full error goes to the server log without the token and without the password.
- Audit: `invite.mailed` or `invite.mail_failed` with the site id, never the token or the body.
- "Sent" means the SMTP server accepted the message. It says nothing about delivery to the inbox or spam filtering. The UI wording and the documentation say so.

## Message

- Built in a new `src/lib/server/mail.ts`: `mailConfig()` (reads and validates the environment) and `sendInvitationMail({ to, link, token, expiresAt, t })`.
- Plain text, UTF-8. The library encodes the subject and sets `Date`, `Message-ID` and `MIME-Version`.
- Body: a short welcome, the link `ORIGIN/accept`, the token on its own line, the expiry (48 hours) and what to do if the mail was not expected.
- Language: the interface language of the inviting administrator (`e.locals.t`). New keys in `en`, `cs`, `de` and `pl`; the parity test covers them.
- The token is not placed in the URL in this version. A prefilled link `ORIGIN/accept#token=...` (a fragment is never sent to the server) is a possible later improvement.

## Sending safely

- One new runtime dependency, `nodemailer` with an exact version (like the other dependencies), installed with `--ignore-scripts` as the Dockerfile already does.
- The recipient is the already normalised and validated invitation address. Reject any value containing CR, LF or a NUL byte before the message is built. Nothing else in the headers comes from user data.
- Timeouts for connect, greeting and the whole send (15 seconds), so a hanging server cannot hang the request.
- TLS is required (`requireTLS` on port 587, secure on 465); certificates are verified, there is no option to turn that off.
- A transport is created per send and closed afterwards; the use is rare and admin only. No queue and no retries in the application, a failed send is visible to the administrator.
- The password is never logged and never part of an error shown to the user.

## Operations

- Google account: preferably a dedicated sender address in Google Workspace on the own domain, because the sender is then the organisation's address and Google signs the mail with the DKIM of the domain once DKIM is enabled in the Workspace admin console. A personal Google account works technically, but the sender is then a personal `@gmail.com` address.
- Authentication: two-step verification on the account and an app password. Google can change or restrict app passwords and the limits of its SMTP service, so check the current Google documentation when setting this up. OAuth 2.0 is out of scope.
- Server (`/opt/wbengine-admin/.env`): the owner adds the five `MAIL_SMTP_*` / `MAIL_FROM` values by hand. The password is typed on the server and does not pass through any chat or ticket. Then the usual deploy (`rsync`, `docker compose up -d --build app`). The server was checked on 2026-11-02: outbound ports 25, 465 and 587 to `smtp.gmail.com` are open.
- Deliverability is the operator's concern: SPF of the sender domain (for Workspace `include:_spf.google.com`), DKIM enabled in Workspace and a DMARC record.
- With a rare use, the first message after a long pause may meet a revoked app password or a security prompt from Google; this is the reason for keeping the token on the screen as the fallback.
- The README gets a section "Invitations by email" with the variables, the Google steps, the limits of "sent" and the fallback.

## Phases

- [x] MAIL-01: `nodemailer` dependency, `src/lib/server/mail.ts` with the configuration check, the message builder and the sender; unit tests with an injected fake transport (exact message, header injection rejected, timeout and error mapping, partial configuration disables the feature, the password never appears in errors).
- [x] MAIL-02: the action and the UI: `mailEnabled`, the second button, the result notice, the audit entries, i18n keys in all four languages, `compose.yaml` and `.env.example`.
- [x] MAIL-03: integration test with the fake transport against a real SQLite database (audit events, the invitation survives a failed send, off without configuration). Open: an HTTP smoke test for the button visibility.
- [ ] MAIL-04: README section and changelog entry are written; the public documentation in the skeleton is in preparation. Open: deploy and a real send to an own address.

## Verification

`npm test`, `npm run check`, the production build, `npm run test:integration`. A manual check on the server: send an invitation to an own address, open the link, accept with the token from the mail. A second check with the configuration removed: the button is absent and the page behaves as before.

## Open points

- The sender display name and the exact welcome wording (to be confirmed before MAIL-02).
