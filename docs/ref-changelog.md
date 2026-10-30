# Changelog

All notable WBengine Admin changes are documented here. Releases follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Target: **0.2.0**.

### Added

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
