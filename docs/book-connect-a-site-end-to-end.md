# Guide: from a new site to managing it in the central admin

This guide takes you from an empty server to a site managed from WBengine Admin. It is written for someone who knows nothing: no prior knowledge of the framework, SvelteKit or the database is required. Every step says what to do, what you will see and what to do when it does not work.

## How the system works

- **WBengine** is a PHP framework. A site built on it (for example the `wbengine-skeleton-app` demo) has its own database, its own content and its own accounts.
- **WBengine Admin** is a standalone application (SvelteKit) that manages the content of several such sites. The content stays on the sites. Admin remembers only the site address and an encrypted integration key.
- The connection is provided by **API v2** on the site. The site issues an integration key (`wbv2_` and 64 characters), Admin stores it encrypted and uses it to call the API.
- **Two kinds of accounts that are unrelated.** An account on the site (role `user`, `editor`, `admin`) is used to sign in to the site and to issue the key. An account in Admin (a global admin, or a member with a role on a specific site, always with MFA) is used to manage content. Credentials of one are never used for the other.

The procedure has eight steps:

1. Build a site on WBengine.
2. Create the first site administrator.
3. Enable API v2 and migrations.
4. Install WBengine Admin.
5. Create the first Admin administrator and set up MFA.
6. Issue an integration key on the site.
7. Add the site in Admin.
8. Manage content, permissions and keys.

## 1. Build a site on WBengine

The quickest route is the `wbengine-skeleton-app` demo site.

Trying it locally (you need Docker):

```sh
git clone https://github.com/rrsoftcz/wbengine-skeleton-app.git
cd wbengine-skeleton-app
docker compose up --build
```

The site runs at `http://localhost:8080`. A clean production server with Docker, Nginx and HTTPS is described in `docs/deploy-vps-docker.md` in the skeleton. The installer is run with the public address of the site: `./bin/setup-production.sh https://www.vase-domena.cz`. It sets `i18n.baseUrl` and the trusted proxy (`http.trustedProxies`) itself, so that the framework behind Nginx recognises HTTPS. Without it, the `/integrations/` page refuses to issue a key with a message that the page was not recognised as HTTPS.

To connect to Admin, the site needs **HTTPS** and **WBengine 4.2 or newer** (the current release is recommended: the Activity page needs 4.9, site users and settings 4.10 and the permission groups of a key 5.1). To check the version: `docker compose exec web grep -A2 '"name": "wbengine/wbengine"' vendor/composer/installed.json`.

## 2. Create the first site administrator

What to expect after a clean install:

- A local `docker compose up` contains the demo account `admin@example.com` with the password `changeme`. It is for your own computer only.
- The production installer **revokes** the demo password (replaces it with a random unusable one). Until you create an administrator, nobody can sign in.

Creating the administrator (the command asks for the password twice and does not display it):

```sh
docker compose -f docker-compose.production.yml exec web php bin/wbe user:create --email=vy@vase-domena.cz --role=admin
```

For a local stack use `docker compose exec web php bin/wbe ...`. Sign in at `/login/` with the e-mail and password. Then remove the demo account:

```sh
docker compose -f docker-compose.production.yml exec web php bin/wbe user:delete --example --dry-run
docker compose -f docker-compose.production.yml exec web php bin/wbe user:delete --example
```

The command refuses to run if no other administrator would remain. Other commands: `user:list`, `user:password --email=...` (reset a forgotten password), `user:delete --email=...`. The commands require WBengine 4.3 or newer.

When it does not work: the message `vendor/bin/wbengine.php is missing` means the dependencies were not installed (`bin/wbe install`). A message about a missing DB means wrong credentials in `src/Config/Settings.json`.

## 3. Enable API v2 and migrations

Three things must hold on the site:

1. `src/Config/Settings.json` contains `"apiV2": { "enabled": true }`. The production installer sets this, for a local stack verify it.
2. The framework migrations `4.0.0/002-api-v2-integrations.sql` and `4.0.0/007-api-integration-last-used.sql` are applied. The skeleton production installer applies migrations `002`, `005`, `006` and `007`. A local stack (`docker compose up`) applies none, and you can check the state with:

   ```sh
   docker compose exec web php vendor/bin/wbengine.php migration:status --config=src/Config/Settings.json --root=src
   ```

   Apply a missing migration manually, and back up the database first: `cat vendor/wbengine/wbengine/migrations/4.0.0/007-api-integration-last-used.sql | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'`.
3. The site is reachable over HTTPS.

The `/integrations/` page on the site checks these requirements itself and lists what is missing.

## 4. Install WBengine Admin

Admin runs on its own server or on the same one (under a different domain). It needs Docker and an HTTPS reverse proxy (Nginx).

```sh
git clone https://github.com/rrsoftcz/wbengine-admin.git
cd wbengine-admin
cp .env.example .env
```

Fill in `.env`:

| Variable | What to enter |
|----------|---------------|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | random passwords (`openssl rand -hex 24`) |
| `DATABASE_URL` | the same password as `MYSQL_PASSWORD`, host `db` |
| `MASTER_KEY` | 64 hex characters (`openssl rand -hex 32`); store it off the server too, without it the stored site keys cannot be decrypted |
| `ORIGIN` | the exact HTTPS address of Admin without a trailing slash, for example `https://admin.vase-domena.cz` |

Start it (migrations run in the container, you do not need Node):

```sh
docker compose up -d db
docker compose run --rm app npm run admin -- migrate
docker compose up -d --build app
```

The application listens on `127.0.0.1:13000`. Nginx has to publish it over HTTPS and pass the `Host` header. Configuration (the certificate is issued by Certbot):

```nginx
location / {
    proxy_pass http://127.0.0.1:13000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

The security headers (`Referrer-Policy`, `X-Content-Type-Options`, `Cache-Control`) are set by the application. Do not set them again in Nginx: a duplicate `Referrer-Policy: no-referrer` causes the error "Cross-site POST form submissions are forbidden".

Check: `https://admin.vase-domena.cz/login` must show the sign-in form.

## 5. Create the first Admin administrator and set up MFA

Admin has no public registration and no default account. The first administrator is invited from the command line on the server:

```sh
cd wbengine-admin
docker compose run --rm app npm run admin -- invite vy@vase-domena.cz global
```

The command prints a one-time token (valid for 48 hours). Then:

1. Open `https://admin.vase-domena.cz/accept`, enter the token and choose a password of at least 14 characters.
2. On the MFA page choose Start setup. A secret key is shown. Add it to an authenticator app (TOTP, SHA-1, 6 digits, 30 seconds), enter the generated code and save the backup codes. They are shown only once.
3. From then on you sign in at `/login` with the password and the code from the app.

Recovery: `docker compose run --rm app npm run admin -- recover vy@vase-domena.cz` issues a token for `/recover` (30 minutes). A lost TOTP is replaced by a backup code. List of accounts: `npm run admin -- users`.

## 6. Issue an integration key on the site

1. Sign in to the site as an administrator (step 2) and open `/integrations/`.
2. You can find a link to the page in the profile of the signed-in administrator (`/profile/`, the Administration section). If the page reports a missing requirement (API disabled, missing migration, HTTP instead of HTTPS), fix it following the instructions on the page.
3. Confirm your password, keep the name `WBengine Admin` and issue the key.
4. The page shows the site address, the name and the key **once**. Keep the page open until you have entered the key in Admin. The site stores only a hash, a lost key cannot be displayed again: you issue a new one.

## 7. Add the site in Admin

1. Sign in to Admin and open the Site registry (`/sites`, the link on the start page).
2. In the Add site section enter the name and the HTTPS address (for example `https://www.vase-domena.cz/`), and paste the key.
3. Choose Verify and add site. Before saving, Admin verifies the address (DNS, certificate), calls `capabilities` and `identity`, and checks that the key allows at least one permission group. The Admin then offers only what the key allows.
4. On success a verified integration is shown with a Manage content link. On failure an instruction is shown and no record is saved.

What the messages mean:

| Message | What to do |
|---------|------------|
| The integration key is not valid or has been revoked | issue a new key on the site |
| The key does not allow anything the Admin can manage | issue a key with at least one permission group |
| The key may not be used from the address of the Admin server | on the site's `/integrations/` page add the address to the key (the card shows the address the key was last used from) or issue a key without address restriction; needs the site to know the real caller address (`http.trustedProxies`) |
| API v2 is not available on the site | enable `apiV2`, apply the migrations (step 3) |
| The site could not be contacted | check the address, DNS and a valid HTTPS certificate |
| The site address points to a disallowed network | the site must be at a public address, private and loopback addresses are blocked by SSRF protection. For a site on the same server see Troubleshooting, Admin and the site on one server |
| The site has temporarily limited failed attempts | wait a few minutes (the site allows only a limited number of failures per address) |
| This site is already registered | the address is unique in Admin |

A global admin sees all registered sites without any additional permission.

## 8. Manage content, permissions and keys

- **Content**: Sites, choose a site, Manage content (articles, pages, menu, sections, boxes, translations, images). Changes go through a draft, a preview and explicit publishing.
- **Other people**: a global admin invites an account with the command `invite EMAIL member SITE_ID editor|siteadmin` on the Admin server, and on the Site registry page, in Account permissions, selects the account by e-mail and a role.
- **Replacing a key** (suspected leak, planned rotation): issue a new key on the site, open Replace integration key for the site in Admin and paste it, and only after successful verification revoke the old key on the site's `/integrations/` page. Admin shows which integration to revoke.
- **Revoking access**: revoke the key on the site and Admin loses access immediately.

## Languages and translations

Languages are site configuration, not content. They are defined only in the `i18n` section of `src/Config/Settings.json` on the site (not in the database and not via the API). The central Admin only reads them from `/api/v2/capabilities` (`i18n.default` and `i18n.locales`, since WBengine 4.6.0).

```json
"i18n": { "enabled": true, "default": "en", "locales": ["en", "cs"], "detect": ["url"] }
```

- `default` is the language of the original content. Articles, pages and menus are stored in it in the regular tables.
- `locales` are all languages of the site, including the default one.
- A translation is not a new article or a new address. It is an extra row for the same record, identified by the record ID and the language code. An empty translation field is displayed in the default language.
- The default language runs without a prefix (`/blog/`), the others with a prefix (`/cs/blog/`).

### Where in Admin I see and choose language versions

- **In the list** of articles, pages and menus there is a **Languages** column with a value such as "3 of 20 languages". Expanding it shows which languages are missing, and a link next to each one opens adding the translation directly.
- **In a record** there is a **Content language** dropdown above the form. Items are grouped: original, translated and missing. Next to it is a summary "Translated 3 of 20 languages, missing: ...". After you choose a language, its content is loaded into the same form. An article translation is saved to the draft (Save translation) and goes live together with the article when it is published (Draft/Published).
- **Deleting:** the button is named after the record type (Delete article, Remove page, Remove menu item, Remove section, Remove box, Remove image). For a page, section or menu item: if content is still attached to it (articles, boxes, menu items, subpages), Admin shows a list of dependent records with links instead of the delete button. Remove or move them first, then you can delete the record. The site also refuses to delete records with dependencies on its own.
- **Live URL:** in the right panel of a page, article, box and menu item there is a link to the actual address on the site, which opens in a new tab. For an article it is the page it is placed on, for a box all pages from its list. Below the link there is a note when the content will not show at the address yet: the page is hidden, the page lacks a box with articles, or the article is only a draft. For a language other than the default, the link leads to the language version, for example `/cs/test-2/`.
- **History** of changes is in the right panel as Latest changes, the last five. Open the full history and restoring an older version with the "All changes and restore" link, so it does not take up space in the editing form.

Translation data is returned by the site since WBengine 4.7.0 (the `translation_locales` field). With an older version the language status is not shown and the dropdown offers all languages without status.

### Adding a language and changing the default

1. Add the code to `locales` in `Settings.json` and reload the application. Admin offers the language the next time it connects to the site.
2. If the site uses translated interface texts, add a language file to the `Locale` directory.
3. Change the default language only after the content has been translated: existing content is stored in the old default language and after changing `default` it would be treated as a new language.

## Optional: site analytics in Admin

The Analytics page in Admin shows the traffic of a site. It requires two things on the site side, and each is handled separately:

1. **Enable analytics collection on the site.** In `src/Config/Settings.json` set `"analytics": { "enabled": true }` and apply the framework migration `4.0.0/006-analytics.sql` (back up the database first; the production installer applies it but leaves collection disabled). Enabling it starts storing aggregated traffic data of the public site, so consider it from the point of view of privacy and visitor consent. Verification: `vendor/bin/wbengine.php doctor --config=src/Config/Settings.json --root=src`.
2. **Issue a key with the Analytics option.** On the site's `/integrations/` page tick Analytics (the option is offered only when step 1 is fulfilled). The key then has 18 permissions instead of 17. A key issued earlier does not have analytics: issue a new one, choose Replace key for the site in the Site registry, and then revoke the old one on the site.

Without both, the Analytics page in Admin states exactly what is missing: analytics disabled on the site, or a key without the `analytics:read` permission.

## Troubleshooting

| Symptom | Cause and solution |
|---------|--------------------|
| "Cross-site POST form submissions are forbidden" | `Referrer-Policy: no-referrer` in the response or in Nginx. It should be `same-origin`, from the application only |
| Admin returns 400 "Invalid request origin" | `ORIGIN` in `.env` does not match the address in the browser, or the proxy does not pass `Host` |
| Signing in to the site does not work after a production install | the demo password is revoked, create an administrator (step 2) |
| `/integrations/` returns 403 | the account on the site does not have the `admin` role (`bin/wbe user:list`) |
| `/integrations/` reports that the page was not recognised as HTTPS | empty `http.trustedProxies` in `Settings.json` (the installer sets it, for a manually set up site enter the Docker network gateway and `forwardedHeaders` `x-forwarded-for`, `x-forwarded-proto`) and `i18n.baseUrl` with `https://` |
| Stored keys cannot be used after a database restore | the original `MASTER_KEY` is missing |

### Admin and the site on one server: "The site address points to a disallowed network"

Before saving, Admin looks up the DNS addresses of the site and refuses anything that is not public (loopback 127.x, private networks). On a single server it can happen that the server resolver returns `127.0.1.1` for your site, even though DNS holds the correct public address. Typical cause: the site domain is a CNAME in DNS to the server name from the provider (for example `vmi123.contaboserver.net`) and cloud-init maps that name to `127.0.1.1` in `/etc/hosts`.

Verification on the server and in the Admin container:

```sh
getent ahosts www.vase-domena.cz
docker compose exec -T app node -e 'require("node:dns/promises").lookup("www.vase-domena.cz",{all:true}).then(r=>console.log(r))'
```

If the output contains `127.0.1.1` or a private address, fix the host. In `/etc/hosts` keep only the short machine name (without the FQDN) on the `127.0.1.1` line, and make the same change in the cloud-init template so that it survives a restart:

```sh
sudo sed -i 's/^127\.0\.1\.1 {{fqdn}} {{hostname}}$/127.0.1.1 {{hostname}}/' /etc/cloud/templates/hosts.debian.tmpl
sudo sed -i 's/^127\.0\.1\.1 vmi123\.contaboserver\.net vmi123$/127.0.1.1 vmi123/' /etc/hosts   # adjust the names to your server
sudo resolvectl flush-caches
```

Repeat the verification, it must return the public IP. A connection from the container to the public address of the same server then usually works. Do not allow the loopback address via `REMOTE_IP_ALLOWLIST`: inside the container it would point to the container itself, not to the site, and it would weaken the protection. The allowlist is intended only for specific approved intranet addresses. If you do not have access to the host, you can give the Admin container public DNS servers via `compose.override.yaml` (`services: app: dns: [1.1.1.1, 9.9.9.9]`), but that does not change the host resolver.

## Optional: let an AI agent manage content

This is separate from the Admin. WBengine 6.3 and newer ship an MCP server that lets an AI client such as Claude write, preview, publish and hide articles of a site.

1. On the site open `/integrations/` again and issue a second key. Choose the preset "Agent for content" (or "Agent, drafts only" if the agent must never publish), give it a name such as `MCP agent` and confirm your password. Do not reuse the key of the Admin, and do not enter this key in the Admin.
2. The page shows, once, a client configuration (JSON) and a `claude mcp add` command with the site address and the key already filled in. Copy one of them into the client and replace `/path/to/wbengine-mcp.phar` with the place where you saved the file `wbengine-mcp.phar` from the WBengine release.
3. Changes made by the agent appear on the Activity page of the Admin with the actor `mcp:<client name>`.

If the agent runs on a laptop, leave the allowed addresses of the key empty: its address changes. Revoke the key on the Integrations page when the agent is no longer needed.

## Key scopes and rotation

When issuing a key the site administrator chooses permission groups (Content, Publishing, Structure, Images, Site administration, History and optionally Analytics); the default grants all of them. The Admin registers any key that allows at least one group and shows only what it covers: a page that needs `audit:read` (Activity), `users:read` and `users:write` (Site users) or `cache:write` and `config:read` (Site settings) shows a notice when the key lacks them. Issue a new key on the Integrations page of the site with the missing group and replace it in the site registry; the scopes of a key never change afterwards.

Related documentation: the Admin README (operations, CLI, security boundaries), the README and `docs/deploy-vps-docker.md` of the skeleton, `ref-api-v2.md` and the framework README (API v2, user management from the command line), and the Getting started and Central administration pages at `https://www.wbengine.org/docs/`.
