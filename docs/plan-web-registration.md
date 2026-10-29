# Plan for Secure Registration of a WBengine Site in Admin

## Goal

The owner of a WBengine site must be able to connect their site to WBengine Admin through web interfaces, without SSH, a terminal, direct database work or manual configuration editing. Registration must verify the real HTTPS API of the target site and securely hand the integration key over to the central server. The global admin sees all registered sites without any further grant.

This document describes a single target solution: a logged-in admin issues the integration key directly on the target WBengine site and copies it once into the registration form of WBengine Admin. No CLI-only onboarding and no separate pairing protocol will be introduced.

## Why the plan is changing

The current implementation has two unfinished halves:

- WBengine API v2 stores only the hash of the integration key and can issue it through the trusted local `Wbengine\\Api\\V2\\Model::provision()`. A public provisioning endpoint intentionally does not exist. A user-facing web interface for key management and the corresponding provisioning CLI command are not finished.
- WBengine Admin has a `site-add` command that expects an already issued key on stdin. The `/sites` page shows management of existing registrations and grants, but new sites are added only by the CLI. That is why the Site selector is empty until the first registration is created.

Radek's account in the central database is `id=1`, `global_admin=1`, `mfa_enabled=1`. A global admin has access to all sites without a grant (`listSites` in `sites.ts` and `permitted()` in `security.ts`), so registration creates no grant. The Site selector is empty only because no site is registered yet. Grants remain for other accounts, and the account ID in them is replaced by selection by e-mail.

## User flow once complete

### A. Issuing the key on the target site

1. The admin logs in to the WBengine site with their local account with the `ADMIN` role.
2. They open the "Integrations" page and choose "Connect to WBengine Admin".
3. Before issuing the key, the page verifies that API v2 is enabled, the required migrations are installed, HTTPS is correctly recognized and the admin currently has the `ADMIN` role in the database.
4. The admin chooses a simple purpose for the key. The default profile "Site administration" (managing the site in WBengine Admin) gets only the scopes needed for the current features: discovery, reading and editing of supported content, translations, images, preview and publishing. Analytics is a dependency on a future framework version: the `SCOPES` whitelist in `Api/V2/Model.php` does not contain the scope `analytics:read` today (it is only in `plan-analytics.md`). Once the framework releases it, it will be added as a separately switchable extension of the profile. Registration must never require analytics. The interface shows human-readable descriptions, not a list of unclear internal scopes.
5. After explicit confirmation, the site creates a random key `wbv2_…`. In the database it stores only its hash, the scopes, the integration name, the local admin and the time. The key itself is displayed only once in the POST response with `Cache-Control: no-store`; it is not put into the URL, log, audit, analytics or persistent browser storage.
6. The page shows complete instructions for the next step: the site address, a recommended name, the scopes and the key with a copy button. The user can continue to the central administration in another tab. After leaving the page, the raw key can no longer be displayed again.

### B. Registration in the central Admin

1. The user logs in to `https://admin.wbengine.org` and verifies with the mandatory MFA.
2. On the "Sites" page they choose "Add site".
3. They fill in clearly labeled fields: the site name, the base HTTPS address of the site and the integration key displayed once. The form explicitly states that the key stays stored encrypted on the server and is never sent to the browser for target API requests.
4. Before saving, the central server securely normalizes and checks the URL, performs a DNS/SSRF check and verifies the TLS certificate. It then calls the public `/api/v2/capabilities` and the authenticated `/api/v2/identity` through the existing pinned HTTPS client. It verifies API v2, the validity of the key, `discovery:read` and the compatibility of the scopes/capabilities with the selected purpose.
5. On error, it saves neither the unverified site nor the key. It shows a concrete safe instruction, for example missing migrations, disabled API, invalid key, missing scope, wrong address, an HTTPS problem or an already registered site. It never shows a secret or a raw exception.
6. On success, it saves the site, the encrypted key and the non-secret `integration_id` from the `/identity` response in one DB transaction. It stores an audit event with the logged-in admin. No grant is created, since the global admin already has access. The key field is cleared and the central database must not keep a plaintext copy of it.
7. The confirmation page shows the site, the verified identity, the available features and an "Open site" link. The site immediately appears in the list and on the further pages for content and analytics.

## Trust boundaries and security

### WBengine

- Provisioning will be available only to a logged-in local account with a current database role of `ADMIN`, never only based on a role stored in a JWT or a hidden form field. Before issuing, rotating or revoking a key, a fresh password confirmation will be required, so that an unlocked long-running session is not enough to issue an integration.
- Every operation of issuing, renaming, rotating and revoking uses POST, the existing session, CSRF protection and a fresh WBengine password verification. GET only displays state.
- The feature will be wired into the existing WBengine object architecture (`Application -> Site -> Section -> Box`) and the namespaces `Wbengine\\Box\\…`, `Wbengine\\Api\\V2\\…`, or the corresponding models. No isolated PHP script or generic provisioning endpoint will be created.
- The raw key is returned to the user only once; the database stores its hash. Issuing, revocation and audit are atomic. If the audit fails, the operation is rolled back.
- The key has the exact prefix and cryptographic entropy established by API v2. Scopes are verified against a finite whitelist. It is not possible to enter a custom PHP class, operation or callback URL.
- The page state and the secret response will be `private, no-store`; the page must not be cached by the framework, a CDN or a shared template cache. The key is only in the response body, never in the URL, so it does not reach the referrer. The page sets `Referrer-Policy: same-origin`, not `no-referrer`: with `no-referrer` the browser would send `Origin: null` for POST forms on the page, and origin checks would reject them (the same bug we fixed in Admin). The header is set only by the application, not by nginx at the same time. The key is not propagated into the query string, an error response or telemetry.
- The page shows active integrations only as non-disclosing metadata: name, issuing admin, date, scopes and status. An already issued key cannot be read back.
- Rotation: the admin creates a new key, the central Admin verifies and replaces the stored credentials, and only then does the admin revoke the old key. The UI shows the order so that no outage occurs. Recovery of a lost key uses the same procedure. The scopes of an existing key cannot be changed; a scope change always means a new key. Thanks to the stored `integration_id`, Admin shows which key the admin should revoke on the site, and rejects a new key with the same ID.
- The framework today has no integration listing and no `last_used_at`. Both are part of REG-02; without them an unused key cannot be safely identified.
- The ADMIN role is always read from the database (`ApiUserModel::getAuthorization`). The ACL in the Application->Site->Section->Box tree distinguishes only a logged-in and a non-logged-in user, so the role check must be done by the Box itself. A fresh password confirmation does not exist in the framework and is built on top of `User/Password.php`. This is the most laborious part of REG-02.

### Central Admin

- Registration is available only to a `global_admin` account with a verified MFA session (`requireGlobal`). The audit records the identity from the session, not a value sent by the client.
- Verification of the key before saving and the key replacement share one function over `remoteGet` (`capabilities`, `identity`). The same function is also used by the CLI `site-add`, which today does not verify the key before saving.
- The framework allows 10 failed authentications per 300 s per IP and does not reset the counter after a success. All sites and Admin users share one outgoing IP, so the registration form limits the number of attempts and the error catalog includes HTTP 429 with `Retry-After`.
- The URL must be HTTPS without user information, query and fragment; the allowed port is 443. The existing DNS/IP validation, pinned lookup, redirect ban, deadline and response limit remain. No new path may bypass `remote.ts` or the SSRF policy.
- The key is accepted only in the HTTPS POST body. It must not appear in the URL, access log, post-processing HTML, session, audit record, analytics, error message or CLI output. In the central DB it is stored only through the existing `SecretVault` encryption with the site context.
- Remote verification runs before the DB transaction. The subsequent transaction inserts the site, the encrypted key, the `integration_id` and the audit together. A unique normalized URL prevents duplicates; a concurrent attempt ends with a safe and understandable error. The schema today has no UNIQUE index on `base_url`, and `VARCHAR(2048)` does not fit into an index, so migration `002` adds a column with the hash of the normalized URL (lowercase host, path with a trailing `/`, without port 443) and a UNIQUE on it.
- After creation, further permissions show accounts as a selection by e-mail and role, not as unlabeled numeric IDs. The system uses the ID internally; a human does not need to find it out.
- Remote API errors will be converted to a finite catalog of safe instructions. Keys and internal network details are not returned into HTML.

## Implementation phases

### REG-01: Contract and pre-check

- Write down the exact scope profile for the current Admin features (source of truth `api-contract.ts` and `canOperate` in `content.ts`) and separate analytics until the framework releases it. The difference between the Admin profile and the framework whitelist is guarded by a contract test in the pilot.
- Define status responses and understandable instructions for missing API v2, SQL migrations, wrong HTTPS, invalid key, scope, duplicate URL, unavailable site and HTTP 429 with `Retry-After`.
- Examine the role/session/CSRF of the existing WBengine web login and choose an existing Box/Section integration without bypassing the Application tree.
- Confirm that an installation can safely refuse key issuance if DB tables or HTTPS trust are missing.

### REG-02: Local integration management in WBengine

- Add a protected screen within the WBengine tree and namespaces.
- Add issuing of a one-time key with a scope description and a list of active/inactive integrations.
- Add revocation and a safe rotation procedure.
- Add an integration listing and `last_used_at` (the framework does not have them today) and a fresh password confirmation on top of `User/Password.php`.
- Verify ADMIN/non-ADMIN, logout, CSRF, one-time display, hash-only storage, audit rollback and the ban on caching/logging.
- Add an installation pre-check with instructions for missing migrations/config; do not execute DDL automatically during an HTTP request.

### REG-03: User registration in WBengine Admin

- Replace the text "Site registration ... is managed by the CLI" with an "Add site" control for global admin only.
- Create a form for the name, HTTPS URL and integration key; add validation, a verification state and safe errors.
- Before saving, verify the capability and identity through the current SSRF-safe client.
- Atomically register the site, encrypt the key, store the `integration_id` and the audit. No grant is created.
- Add migration `002` (unique normalized URL, the `integration_id` column) and fix the migration runner, which today splits the file by `split(';')` and does not know a record of applied migrations.
- Add the "Replace integration key" action: verify the new key before overwriting, overwrite `key_cipher` in a transaction with the audit.
- Limit the number of key verification attempts and handle HTTP 429.
- Separate site registration from management of further grants. Replace the manual account ID with selection of an account by e-mail.
- Keep the CLI as a trusted operational/recovery tool, not as a necessary path for a regular site owner.

### REG-04: Verification across both systems

- Unit and database scenarios for issuing/revoking/rotating WBengine keys and the transaction boundaries.
- HTTP scenarios for ADMIN login, CSRF, MFA/session according to the existing model, no-store and safe error responses.
- Admin scenarios for a valid/invalid key, scope, unavailable site, timeout, bad TLS, DNS rebinding, private IP, redirect, duplicate URL and concurrent registration.
- A real two-site Docker pilot over publicly trusted HTTPS or a test CA: issue a key on one site, register it through the Admin UI, verify the capabilities and load the permitted content. Verify that another site and an account without a grant gain no access. The pilot targets a specific released framework version and the pin in the Admin CI (today v4.0.0) is updated before it.
- On the dev environment, verify that the Admin container can reach the public IP of the same server (`www.wbengine.org`), otherwise registration of one's own skeleton fails on the DNS/SSRF policy.
- Perform one graphical browser walkthrough from login on the local WBengine site to the displayed site in the central Admin. Do not put a production key into the tests.

### REG-05: Documentation, deployment and operations

- Update the README and the web guides of both projects: API v2 requirements, the migration procedure, key issuing, registration, error messages, rotation and revocation.
- Remove the claim that site registration requires the CLI. Keep the operational CLI procedure for emergency administration.
- Connect the production site only after a successful pilot and deployment to the dev environment. The framework version release happens before the pilot (see the phase order).
- Deploy the Admin UI without changing existing data. Before registering production, verify the Admin DB backup and keep the current empty/safe state.
- In every phase, update this plan, create a separate commit and push following the existing procedure.

## Phase order

1. REG-01: contract and pre-check.
2. REG-02 (framework) and REG-03 (Admin) in parallel. Admin verifies through `provision()` in a fixture and does not depend on the framework UI.
3. Framework version release and update of the pin in the Admin CI.
4. REG-04: verification across both systems and the pilot.
5. REG-05: documentation, deployment to the dev environment, and only then production.

## Acceptance criteria

- A regular global admin connects a new WBengine site without SSH, a terminal, DB access or developer support.
- No site appears in the central selector before the key is successfully issued and verified.
- After a successful registration, the site is immediately in the global admin's list; no manual lookup of `user_id` and no grant for it is needed.
- An invalid key, missing scope, bad certificate, unsafe URL or timeout leaves no partial registration or grant.
- The raw key is displayed once on WBengine; WBengine stores the hash and the central server the encrypted value. No key is in a log, URL, audit, HTML after a subsequent load or an error message.
- Permissions are enforced simultaneously by the central role, the integration scope, the remote capabilities and local authentication when managing the key.
- The owner can safely rotate or revoke the key in the UI and knows how to return from a failed rotation.
- The documentation of both projects matches the actual verified flow.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The key leaks from HTML/log or a shared computer | One-time display, no-store, POST, no URL/logging, a clear warning and an immediate option to revoke |
| The admin creates a key that is too broad | A preset named scope profile with the minimum for the chosen features; no custom scope text |
| The URL points into an internal network or the DNS changes | Reuse and do not relax the existing pinned DNS/SSRF defense on every connection |
| Registration in Admin fails after the key is issued | The key stays active, the user can safely retry registration with the same key; if a leak is suspected, they revoke it and issue a new one. The central server stores no unverified record |
| Rotation interrupts service | Issue and verify the new key, switch the central encrypted credentials, then revoke the old one |
| Registry access is assigned to the wrong account | Registration only for an MFA-authenticated global admin; grants to other accounts by selection by e-mail |
| Wrong keys lock Admin out (limit of 10 failures per 300 s per IP) | Limit the number of attempts in the registration form, handle HTTP 429 with `Retry-After` |
| Duplicate registration of the same site | Migration `002` with a unique hash of the normalized URL |
| API v2 is not ready on the target | The pre-check shows a concrete procedure and stops registration without partial changes |

## Current state

- [x] WBengine API v2 has a local `Model::provision()`/`revoke()`, key hashes, scopes, audit and HTTPS identity/discovery.
- [x] WBengine Admin stores existing keys encrypted, uses a pinned HTTPS client and has the CLI `site-add`.
- [x] Admin shows the registry/grants page, but offers new registration only through the CLI.
- [ ] WBengine has no user screen for issuing/revoking an integration key, no integration listing, no `last_used_at` and no fresh password confirmation.
- [ ] The WBengine scopes whitelist does not contain `analytics:read` (only in `plan-analytics.md`).
- [ ] Admin has no web form "Add site" with key validation before saving, a unique URL (migration `002`) or key replacement.
- [ ] Granting permissions requires a manually looked-up account ID.
- [ ] The guides do not describe an onboarding that can be completed without expert operational access.

## Phase status

- [x] REG-01: `src/lib/server/registration-contract.ts` (scope profile `management`, a catalog of 13 safe errors including HTTP 429, the shared function `verifyRegistration` for web and CLI) and `tests/registration-contract.test.ts`, which guards that `canOperate` never requires a scope outside the profile.
- [x] REG-02: framework (PR rrsoftcz/wbengine#5): Box `Integrations`, password confirmation, `Model::list()`, `last_used_at`, preflight. Skeleton (PR rrsoftcz/wbengine-skeleton-app#4) merged.
- [x] REG-03: Admin. Migrations `002` and `003` with a record of migrations (`schema_migrations`), the "Add site" form with verification before saving, unique URL, `integration_id`, key replacement, attempt limiting, account selection by e-mail. Covered by `tests/mysql.integration.ts` and `tests/http.smoke.ts`.
- [x] WBengine v4.2.0 released, Admin CI pin updated. Framework 4.2.0 and the skeleton deployed to the dev environment (contabo), migrations `4.0.0/007` and skeleton `013` applied.
- [ ] REG-04: automated tests and the CI pilot are done (framework 2050 tests, Admin MySQL registration and rotation scenario, two-site pilot). One graphical walkthrough on the dev environment remains (issuing the key on the skeleton and registering in Admin), which requires ADMIN test accounts.
- [ ] REG-05: Admin and framework README updated; production and the skeleton guides remain after the graphical walkthrough.
