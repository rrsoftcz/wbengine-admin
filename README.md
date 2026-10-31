# WBengine Admin

A standalone control centre for the WBengine API v2: SvelteKit 3.1.0, Svelte 5, TypeScript, adapter-node 6 and MySQL 8.4. The browser talks only to the control centre. Content stays on the individual sites.

The project includes invitation-only accounts, passwords, mandatory TOTP, backup codes, password recovery, SQL sessions, per-site permissions, a registry and discovery of the remote API. The content editor at `/content/{id}` manages articles, pages, menus, sections, registered boxes, translations and public raster images. It supports drafts, private preview, explicit publishing, revisions, structural restore and manual conflict resolution. The front page overview at `/analytics/{id}` shows aggregated views. Every operation requires, at the same time, a central role, an integration key scope and a site capability.

## Documentation

- [Guide: from a new site to managing it in the central admin (A to Z)](docs/book-connect-a-site-end-to-end.md)
- [Plan and implementation status](docs/plan-admin-implementation.md)
- [Changelog](docs/ref-changelog.md)

## Local verification

Node 22.18 or newer, Node 24 for the container. Dependencies are locked in package-lock.json.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run test:mysql
```

The last command builds the application, creates its own Compose project with a random name and port and MySQL 8.4, generates temporary passwords outside the repository, runs database and real HTTP tests, and removes only its own project including its test volume. It requires access to local Docker. It does not connect to existing databases. The standalone `npm run test:integration` requires a DATABASE_URL pointing to a database named wbengine_admin_test and a MASTER_KEY.

The HTTP smoke test simulates TLS termination with a direct loopback connection. It verifies cookie flags, CSRF, redirects through MFA, session rotation, the registry and sign-out. It does not replace verifying the certificate and proxy in the target deployment.

## Configuration and startup

Copy `.env.example` to `.env` and fill in random passwords and MASTER_KEY locally: 32 random bytes in hex format. Keep the master key in an operational secret store outside the database. The matching master key is needed when restoring the database. Rotating the master key requires a controlled re-encryption of the data; automatic rotation is not part of this stage.

DATABASE_URL in Compose uses the host `db`. For a CLI run on the host, use your own URL with the host 127.0.0.1 and the published local port. Both the runtime and the CLI read environment variables; the CLI does not load them from `.env` itself. Do not put credentials into the shell history.

```sh
docker compose up -d db
npm run admin -- migrate
docker compose up -d --build app
```

The app listens on 127.0.0.1:13000 and assumes an HTTPS reverse proxy. ORIGIN must be an exact HTTPS origin without a trailing slash. Adapter-node 6 derives the HTTPS origin from the Host header by default, and the control centre additionally compares it with ORIGIN. The proxy must pass the correct Host and remove or overwrite its own forwarded headers. Trusted proxy headers are not enabled. Secure cookies are never turned off, not even in development; manual use requires a local HTTPS proxy.

The application does not run DDL on every request. Run the migration before starting every version that adds a file in `migrations/`: the `migrate` command applies each `NNN-*.sql` file once and records it in the `schema_migrations` table. The Docker image contains both the CLI and the migration SQL: you can use `docker compose run --rm app npm run admin -- migrate`. The image runs as the node user, and the database has a separate application user.

## Activity

Site administrators see an Activity page per site (button on the site overview): the change log of the site with who made each change, when, and through what (Admin or API, site login, command line), filterable by record type and source, plus the writes the site rejected (error code only). It needs a site running the change feed (`GET /api/v2/changes`) and an integration key with the `audit:read` scope; a key issued before that scope existed shows a notice asking for a new key.

## Users and settings of a connected site

Site administrators (and global admins) get two more pages per site when the site runs the remote administration API and the integration key carries the scopes `users:read`, `users:write`, `cache:write` and `config:read`:

- **Site users** (`/content/<site>/users`): list and search the accounts that sign in on the site itself, create an account (the response carries a one-time password link, shown once, that works on `/login/?reset=TOKEN` of the site), change the role (user, editor, administrator), disable and enable. Passwords are never set, read or stored by the Admin; the last active administrator of a site cannot be demoted or disabled.
- **Site settings** (`/content/<site>/settings`): the effective settings of the site, read only, with secret values shown only as "set", and a button that flushes the site cache.

A key issued before these scopes existed still registers; the pages then ask for a new key. Every action is recorded in the site's change log with the Admin user as actor and in the Admin audit.

## Central users

Global admins manage the accounts of the Admin itself at `/users`: search, invite (one-time code), disable and enable, promote and demote global admins, one-time recovery codes, MFA reset and revoking site access. Nobody can change their own role or status there and the last global admin is kept.

## Interface language and profile

The interface is available in English, Czech, German and Polish. The language is chosen per request: the signed-in user's saved language (Profile, Language), then the `wb_locale` cookie, then the browser's `Accept-Language`, then English. Every user-visible string lives in the catalog `src/lib/i18n/<language>/` (English is the source and the fallback); components use `t('key')`, server code uses `locals.t('key')`. A test fails when a translation has an unknown key, an empty text or different placeholders, or when a finished language lacks a key.

Each user has a profile at `/profile`: account overview, interface language, password change (current password required, other sessions are signed out), backup codes, two-step verification reset and recent account activity.

## Administration through the trusted CLI

The CLI performs administrative operations directly on the server. Access to it and to its environment is privileged operational access. It does not send anything automatically by e-mail or any other channel.

```sh
npm run admin -- invite admin@example.com global
npm run admin -- invite editor@example.com member 1 editor
npm run admin -- recover admin@example.com
npm run admin -- users
npm run admin -- revoke 12 1
npm run admin -- site-add 'Sample site' https://example.com/
```

`invite` issues a one-time token valid for 48 hours. The administrator passes it over a secure channel, and the user opens `/accept` and enters the token into the form. The first global administrator is created the same way. There is no public registration and no default account. An invitation for an already existing e-mail neither creates another account nor adds roles.

`recover` issues a one-time token valid for 30 minutes for `/recover`; older unused tokens are invalidated. Changing the password cancels all sessions and keeps MFA. A lost TOTP is handled by a one-time backup code; neither disabling MFA on the web nor recovery with the password alone is available.

`site-add` requires the integration key on stdin, not as an argument. Pass it through a secure pipe from a secret store or a private file. When used from a keyboard, the CLI refuses the operation so that the key is not echoed in the terminal. The key must not be in the shell history. Before saving, the CLI verifies the key with the same function as the web form. The usual route is the web: a global admin with MFA adds a site on the `/sites` page (name, HTTPS address, integration key issued on the target site), the key is verified through `capabilities` and `identity` before saving and is stored only encrypted. The same page allows replacing the key: the new key is verified, only then does it overwrite the stored one, and the administrator revokes the old key on the target site. The key is never returned to the browser. A global admin sees all sites without a grant, and other accounts are assigned siteadmin/editor by choosing the account by e-mail. `revoke` removes a specific site permission. Changing a role or removing a permission cancels the sessions of the affected user.

## Security boundaries

- Passwords: scrypt with a random salt, length 14 to 256 characters. Password and MFA attempts have persistent limits of 8 and 12 attempts per 15 minutes. Sign-in holds the user row lock from reading the password to creating the session, so a concurrent password change or deactivation cannot create a new session based on the old state.
- Sessions: the database contains only the SHA-256 of the token, the expiry and the CSRF binding. The `__Host-wbadmin` cookie has Secure, HttpOnly and SameSite=Strict; lifetime 8 hours. After MFA the token and CSRF are rotated. All state-changing forms have session CSRF and an origin check, including sign-in and MFA setup.
- MFA: TOTP SHA-1, 6 digits, 30 seconds, tolerance of one time step. The accepted counter is stored atomically and cannot be reused. Ten random backup codes are shown once, only hashes are in the DB. The enrollment secret is shown once to the account's own signed-in user during setup, and is encrypted in the DB.
- Secrets: AES-256-GCM, random IV and an authenticated context of the specific site/account. Integration keys are not returned in HTML, form errors, API responses or the audit. The error handler does not print exceptions with credentials.
- Permissions: checked on the server for every access, grants are bound to the user/site pair. An editor may read their site, edit article drafts and their translations, and upload public images. A siteadmin additionally changes the structure, publishes and removes content, and a global admin also manages the registry. The remote identity and the actor label in the audit do not assign central roles. The current registry UI is reserved for the global admin.
- Remote API: only a finite list of resource/operation under `/api/v2/`, no arbitrary URL proxy endpoint, no redirects, verified TLS, an overall 8 s deadline from the start of DNS through TLS to the end of the body, and a 1 MiB response limit. Rejection, timeout and abort close both the request and the response, and a rejected response is not read to the end. Identity uses a Bearer key with the discovery:read scope. Discovery is public and does not receive Authorization.
- SSRF: only HTTPS port 443, without credentials/query/fragment. All DNS answers are verified before every connection, and the actual HTTPS socket uses only the validated IP through a pinned lookup. Local, private, link-local, multicast, documentation, mapped and selected transition IPv4/IPv6 ranges are forbidden. The socket does not perform a second DNS resolution. The IPv6 policy is deliberately conservative.
- An intranet is possible only after operational approval of specific IPs in `REMOTE_IP_ALLOWLIST`, separately from site registration. There is no global allowPrivate. An exception does not cancel TLS validation or the redirect ban. Also keep a network egress firewall as another layer.

The audit contains only identifiers, a fixed operation name and the time. It does not contain request bodies, keys, passwords or MFA codes. Expired sessions, used invitations and recovery records are for now deleted by operational maintenance; an automatic retention job is not enabled.

The architecture builds on the [official adapter-node](https://svelte.dev/docs/kit/adapter-node), [server actions](https://svelte.dev/docs/kit/form-actions) and the server-only directory `src/lib/server`. Kit 3 uses configuration in vite.config.ts, `$app/tsconfig` and the package subpath import `#lib/*`. The content server gateway uses a finite resource/operation allowlist, strong ETags and a check of site grants. On HTTP 412 it preserves the exact content being edited and the original ETag. A manual merge is a separate read-only operation for the current version, and the subsequent save is explicit. The preview is in an iframe without sandbox exceptions and with a restrictive CSP, external media and scripts are blocked. Images up to 512 KiB are public after upload, and the UI requires confirmation of this property.


## WBengine analytics

The dashboard `/analytics/{id}` is available to users with a grant for the given site, and only if the remote integration key contains `analytics:read` and the API announces `capabilities.analytics.read`. The key stays on the server. The overview offers daily, weekly and monthly aggregations, the most visited pages and articles, the most frequent box occurrences and lifetime totals.

The default period contains 30 calendar dates ending on the previous UTC day. This way the admin does not ask the site for a future local date if its time zone is ahead of UTC. The daily boundary of the response follows the time zone of the target site. Periods before the first recorded public view are marked as incomplete.

## Connecting a new site

Requirements on the target site: WBengine 4.2.0 or newer (the current release is recommended: activity needs 4.9, site users and settings 4.10, permission groups of the key 5.1), `apiV2` enabled in `Settings.json`, HTTPS and the applied framework migrations `4.0.0/002` and `4.0.0/007` (`doctor` reports them as `migration.002` and `migration.007`).

1. On the target site sign in as ADMIN, open the Integrations page, confirm your password and issue a key. It is shown once: the site address, a recommended name and the key.
2. In the central Admin open Sites, choose Add site and enter the name, the HTTPS address and the key. Before saving, `capabilities` and `identity` are verified, and the key must allow at least one permission group (always `discovery:read` plus something to manage). The site administrator chooses the groups when issuing the key: Content, Publishing, Structure, Images, Site administration, History and optionally Analytics. The Admin shows and enables only what the key allows; for a page the key does not cover it asks for a new key. The site administrator may also bind the key to the address of the Admin server; a call from another address is reported as such.
3. Errors are shown as a concrete instruction: missing API or migration, invalid key, missing scope, unreachable site, duplicate address, attempt limit (HTTP 429, try again in a few minutes).
4. Replacing the key: issue a new key on the site (the option for the integration being replaced), enter it in Admin for the site under Replace integration key, and only after verification revoke the old key on the target site. A lost key cannot be displayed again, the procedure is the same as for replacing.

### Keys for AI agents (MCP)

WBengine 6.3 and newer can also be managed by an AI client such as Claude through its MCP server (`wbengine-mcp.phar`, see `ref-mcp.md` of the framework). That connection does not go through this Admin: the MCP server talks to the site with its own integration key. Issue a separate key for it on the site's Integrations page with the preset "Agent for content" (or "Agent, drafts only", which cannot publish), and do not reuse the key registered here. One key per client means each can be revoked on its own and the Activity page shows who changed what: changes made by an agent carry the actor `mcp:<client name>`. Do not bind an agent key to an IP address when the agent runs on a laptop with a changing address.

On the target site, before enabling, you need to apply `migrations/4.0.0/006-analytics.sql` from WBengine manually and add to `Settings.json`, for example:

```json
"analytics": {
  "enabled": true,
  "timezone": "Europe/Prague",
  "retentionDays": 62
}
```

Daily aggregations are removed after 62 days, lifetime totals of pages and boxes remain in `cms_analytics_totals`. The lifetime article count comes from the original `cms_articles.views`. New daily series start only after enabling, older daily history is not backfilled. Local operational maintenance can be run through the framework CLI, for example `php vendor/wbengine/wbengine/bin/wbengine.php analytics:prune --config=/path/to/src/Config/Settings.json`; the command removes at most 1000 old daily rows per run.

Analytics stores only summary counts by date and content ID. It does not record IP addresses, cookies, user IDs, User-Agent, referrer, query parameters or individual visits. Traffic is therefore called views, not unique people. Unknown robot requests are counted the same as other public requests. Cache HIT and 304 responses are included; a box occurrence means a non-empty generated output in the response, not a confirmation that it was displayed on screen.

The article form saves a draft. The publish button publishes only the last saved draft; unsaved changes in the form are not part of it. The preview shows the saved draft, or the selected translation, in a separate sandbox. Restoring a revision recreates a draft and does not publish it automatically.

Structure is saved directly. After a page, menu, section or box is removed, an open history remains for restoring. For a previously removed record you can enter its ID in the collection. Restore uses its own recovery ETag from the history; the regular detail ETag does not replace it. During restore the API re-verifies the links, translations and available registered boxes.

On conflict no automatic retry is performed. The user can discard their changes and load the remote state, or display the current content and explicitly take over its ETag for a manual merge. This operation writes nothing by itself. The changes are then reviewed and saved separately.

`tests/api-pilot.ts` verifies real central HTML forms against the current PHP API over verified HTTPS. The fixture provider is in the framework project `tests/pilot/`. It uses its own Docker network, databases, a generated CA and keys outside Git. The consumer needs `PILOT_API_URL`, `PILOT_API_KEY`, `DATABASE_URL` ending in `/wbengine_admin_pilot`, `MASTER_KEY`, `REMOTE_IP_ALLOWLIST` and `NODE_EXTRA_CA_CERTS`. The test runs inside the production image with a mount of this tests directory and the runtime CA, not against a production site. It does not require disabling TLS verification and does not print keys.


The shared administration CI now uses two truly independent API installations. The same locally:

```sh
sh /path/to/wbengine/tests/pilot/pilot.sh start
sh /path/to/wbengine/tests/pilot/pilot.sh probe
sh /path/to/wbengine/tests/pilot/pilot.sh consumer /path/to/wbengine-admin
sh /path/to/wbengine/tests/pilot/pilot.sh backup-check
sh /path/to/wbengine/tests/pilot/pilot.sh reset
```

Preparing images and permissions is described in the core tests/pilot/ref-pilot.md. The finite test control of outage/revocation adds neither the Docker socket nor a public control endpoint to the control centre. When the connection is unavailable or rejected, the submitted form and ETag are preserved in the same request; the next attempt is manual and re-checks all permissions.
