# Changelog

All notable WBengine Admin changes are documented here. Releases follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Target: **0.2.0**.

### Added

- Optional invitation by email: when `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASSWORD` and `MAIL_FROM` are set (and optionally `MAIL_SMTP_PORT`), the invite form on `/users` has a second button that mails the person a welcome text, the link to `/accept` and the one-time code, in the language of the inviting administrator (English, Czech, German, Polish). The code is still shown on the screen as the fallback, a failed send shows its reason (login rejected, address rejected, no connection, timeout, unknown) and never fails the invitation, and the outcome is audited (`invite.mailed`, `invite.mail_failed`). Without the configuration nothing changes. Uses one new runtime dependency, `nodemailer`; the README describes the variables and the steps for a Google account (app password). `compose.yaml` passes the variables and `.env.example` lists them.
- The MIT license (`LICENSE`, the `license` field of `package.json` and a License section of the README), the same license as the framework and the skeleton.
- The analytics page shows the page views by language for a site on WBengine 6.7 or newer, with the language name in the language of the interface, and says that views counted before the site recorded languages belong to no language. A site that does not record languages yet gets a hint about the framework database update 6.7.0/013. The totals are unchanged: they are the sum of all languages. A malformed split is dropped and never fails the overview.
- Documentation names the preset "Editor with structure and statistics" (WBengine 6.4) for keys of AI agents: pages, menu, boxes, images, statistics and the change log, no users and no settings.
- Documentation of keys for AI agents (MCP server of WBengine 6.3): a separate key with the preset "Agent for content", never the key registered in the Admin; changes of an agent appear in Activity with the actor `mcp:<client name>`.

- Hiding and showing a published article (needs WBengine 6.2 on the site and the permission group Publishing): a status badge, a button in the article editor and a visibility panel. A hidden article's page answers 404 on the website and its menu item disappears; the article list shows the state.
- A key bound to other addresses (site setting) is reported with its own message when registering and when the site rejects a call (`ip_not_allowed`), instead of a generic missing permission.
- Keys with any permission groups are accepted (only `discovery:read` plus one more permission is required); the Admin shows only what the key allows.
- Interface languages English, Czech, German and Polish (catalog under `src/lib/i18n`, per-user setting,
  cookie and browser fallback, parity test). User profile with password change, backup codes, MFA reset,
  language and a paged, filterable activity list.
- Central user management for global admins (`/users`): invite, disable and enable, promote and demote,
  recovery codes, MFA reset, revoke site access, all audited.
- Per-site Activity page (change feed of the site, rejected writes), Site users (create with a one-time
  password link, role, disable and enable) and Site settings (redacted configuration, cache flush).
  These need the scopes `audit:read`, `users:read`, `users:write`, `cache:write` and `config:read`;
  keys with fewer permission groups still register and the pages ask for a new key.
- Device names and a page picker in the box form, live URL of a record, an article-box notice that follows
  the site's `renders_articles` flag.
- Per-site analytics dashboard with daily, weekly and monthly trends, top pages,
  articles and boxes, and lifetime totals.
- Server-side analytics API gateway with site-grant, `analytics:read` scope and
  API-capability checks. Integration keys remain on the server.
- Analytics dashboard coverage in the two-site HTTPS API pilot.

### Changed

- Page links are normalized on save to the `/o-nas/` form (leading and trailing slash).
- New pages can automatically get a `story` box in the `central` section so the
  published article shows; the article editor warns when the chosen page has no such box.
- Article Source is optional free text; the error message now only concerns control characters.

### Security

- Analytics pages are private, server-rendered and sent with `no-store`; the
  dashboard exposes no integration key or visitor identity data.

### Upgrade notes

- The connected WBengine installation must provide `analytics:read` and
  `capabilities.analytics.read`.
- Apply WBengine migration `migrations/4.0.0/006-analytics.sql` and enable
  analytics on that installation before it can record views.
- Daily analytics history is retained for 62 days by default. Lifetime counts
  remain available independently.
