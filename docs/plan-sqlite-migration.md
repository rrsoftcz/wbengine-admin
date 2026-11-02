# Plan: replace MySQL with SQLite in WBengine Admin

Status: approved by the owner. PR 1 is implemented (SQL-00 to SQL-07, SEC-01 to SEC-06); SQL-08 (green pilot job) and SQL-09 (independent review, findings fixed: read connection for session loading, private directories, guarded commit, statement cache cap, stricter import guard) are done, the cutover and PR 2 are not done yet.

## Decision and reasons

The administration stores 9 small tables (users, sites, grants, sessions, invitations, recovery, backup_codes, login_attempts, audit) and is written by exactly one application process. It uses transactions, foreign keys with cascade and row locks, and nothing else MySQL specific: no replication, no fulltext, no JSON columns, no stored routines.

- Driver: the built-in `node:sqlite` (`DatabaseSync`). No new dependency, `mysql2` leaves the production image. `engines` already requires Node >= 22.18 and the image runs Node 24.
- Not a JSON file: login state needs atomic writes, unique keys and cascade deletes. A JSON file would reimplement a worse SQLite.
- Not `better-sqlite3`: it would add a native dependency and a build step for a gain we do not need. Everything touching the driver stays in `src/lib/server/db.ts`, so switching later is a one-file change.
- Result: one container (`app`) and one volume with `data/admin.sqlite`. The `db` service, its healthcheck, `MYSQL_*` secrets and the published MySQL port disappear.

## Constraints that shape the design

1. `node:sqlite` is synchronous and we hold one connection. A transaction that awaits something in the middle (password hashing, I/O) would let other requests run their statements inside it. Therefore every transaction goes through one async lock (a promise queue) in `db.ts`, and a transaction is opened with `BEGIN IMMEDIATE`. `FOR UPDATE` is removed everywhere, the lock replaces it.
2. Because of the lock, slow work must not sit inside a transaction. Audit task: find awaits in transactions (scrypt or argon2 verification in `auth.ts` and `profile.ts`, anything remote). Move them out or accept them knowingly (a few admins, about 100 ms per login).
3. Exactly one application instance. This is also what the owner wants. The database file lives on a local Docker volume, never on a network share.
4. Time values must stay compatible with what the code and tests already read. Today `dateStrings: true` returns `YYYY-MM-DD HH:MM:SS(.fff)` in UTC. We keep that exact text format in SQLite, so comparisons between text values stay correct.

## Target design of `db.ts`

Keep the current call shapes so that call sites change only in their SQL strings, not in their logic.

- `database()` opens the file from `DATABASE_PATH` (default `data/admin.sqlite`; tests use a temporary file) with `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=FULL` (write volume is tiny, durability matters for security data).
- `rows(c, sql, args)` returns an array of rows.
- `c.execute(sql, args)` keeps returning a tuple: `[rows]` for statements that return columns, `[{ insertId, affectedRows }]` for writes (`lastInsertRowid` converted from bigint to number, `changes`).
- Argument conversion: `Date` to `YYYY-MM-DD HH:MM:SS.mmm` UTC text, `boolean` to 0/1 (the driver rejects booleans), `undefined` is an error as today.
- Prepared statements are cached per SQL string.
- `transaction(action)` takes the lock, `BEGIN IMMEDIATE`, commit or rollback, release.
- Exposed `backup(path)` using `VACUUM INTO` for consistent online backups.

## SQL dialect mapping

| MySQL | SQLite |
|-------|--------|
| `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `BIGINT UNSIGNED`, `INT UNSIGNED`, `BIGINT` | `INTEGER` |
| `VARCHAR(n)`, `CHAR(n)`, `CHARACTER SET ascii`, `TEXT` | `TEXT` (email column `COLLATE NOCASE`) |
| `BOOLEAN` | `INTEGER NOT NULL DEFAULT 0 CHECK (x IN (0,1))` (`TRUE`/`FALSE` keywords work) |
| `ENUM('editor','siteadmin')` | `TEXT CHECK (role IN ('editor','siteadmin'))` |
| `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` (same UTC text) |
| `DATETIME(3)` | `TEXT` in `YYYY-MM-DD HH:MM:SS.mmm` |
| `NOW(3)` | `strftime('%Y-%m-%d %H:%M:%f','now')` |
| `DATE_SUB(NOW(3), INTERVAL ? MINUTE)` | `strftime('%Y-%m-%d %H:%M:%f','now', '-' \|\| ? \|\| ' minutes')` |
| `INSERT IGNORE` | `INSERT OR IGNORE` |
| `ON DUPLICATE KEY UPDATE role=VALUES(role)` | `ON CONFLICT(user_id,site_id) DO UPDATE SET role=excluded.role` |
| `... FOR UPDATE` | removed (`BEGIN IMMEDIATE` plus the lock) |
| `SHA2(x,256)` (migration 003 only) | not needed in a fresh schema, computed in the import script |
| `ALTER TABLE ... ADD COLUMN ..., ADD UNIQUE KEY` | the final schema is created at once |

The `NOW(3)` and `INTERVAL` helpers are repeated in about 30 places, so add two tiny SQL constants in `db.ts` (`NOW`, `minutesAgo(n)`) instead of repeating the expression.

## Migrations

- Replace the four MySQL migrations with one baseline `migrations/001-baseline.sql` containing the final schema (all columns from 001 to 004, `url_hash` unique, `integration_id`, `locale`, `password_changed_at`, indexes on `sessions.expires_at`).
- The runner `migrate.ts` stays (`schema_migrations`, one file once, in name order), now over `DatabaseSync.exec`. Each migration file runs in a transaction.
- The old MySQL files are removed from the tree (kept in Git history).

## Security review

Site API keys are not protected by the database. `sites.key_cipher` holds AES-256-GCM ciphertext (`SecretVault`, random IV, associated data `site:<id>`), and the key `MASTER_KEY` lives only in the application environment, never in the database or in a backup of it. The same holds for the MFA secrets (`mfa:<user id>`). Passwords are scrypt hashes, sessions, invitations and recovery codes are stored as SHA-256 hashes. The remote side stores only the SHA-256 hash of each key (framework, unchanged by this plan). So the storage engine holds nothing usable on its own, before and after.

What does not change: the ciphertext format, `MASTER_KEY`, the transport to the sites (HTTPS, verified certificate, pinned address lookup, optional `REMOTE_IP_ALLOWLIST`), the per-site key scopes and the optional address restriction of a key on the site.

What improves: no database server process, no network listener, no database account or password (`MYSQL_PASSWORD`, `DATABASE_URL`), no published MySQL port on the host. The attack surface shrinks.

What needs care (new tasks in PR 1):

- [x] SEC-01: the database file and its `-wal` and `-shm` files are created mode 0600 owned by `node` in a directory mode 0700 (set the process umask to 077 in the entrypoint). Test: assert the mode after creation.
- [x] SEC-02: `PRAGMA secure_delete=ON` so a replaced or deleted ciphertext (key rotation, user removal) is overwritten instead of lingering in free pages.
- [x] SEC-03: backups made by `admin backup` are created mode 0600 and the command refuses a world readable target directory. Documentation: a backup contains ciphertext and password hashes, so it must never be stored together with `MASTER_KEY`, and `MASTER_KEY` needs its own separate backup in a password manager.
- [x] SEC-04: SQLite specific injection hardening. All statements stay parameterized (this is already the rule: `execute` with arguments, `multipleStatements:false`). Additionally `PRAGMA trusted_schema=OFF`, extension loading stays disabled (the `node:sqlite` default), and a test that a statement containing a second statement is rejected by `prepare`. `ATTACH DATABASE` is the only way an injection could reach outside the file, so grep proves no SQL is built from user input (a lint style test over `src/lib/server`).
- [x] SEC-05: the import test decrypts every `key_cipher` and `mfa_secret` after the import (proves ids and `MASTER_KEY` still match, because the associated data contains the row id) and never prints a key or a cipher.
- [x] SEC-06: the volume is a local named volume, not a bind mount of a shared or world readable host directory; documented in the README.

Out of scope, recommended as a separate later change: read `MASTER_KEY` from a Docker secret file instead of an environment variable (visible in `docker inspect`), and a documented `MASTER_KEY` rotation command that re-encrypts all ciphers. Neither is made worse or better by SQLite.

Moving the administration to another host is simpler after this change: copy one file and the `.env` (`MASTER_KEY`) over a secure channel. The one thing that is independent of storage and must be remembered: a site that restricts an integration key to allowed addresses has to be told the new outbound IP of the administration.

## Order of work

Two pull requests, each with green CI and a squash merge as usual. Both on branches, never on `main` directly.

### PR 1: port to SQLite plus cutover tooling

- [x] SQL-00: spike on `node:24-alpine` (the production image): `node:sqlite` loads, `strftime('%f')` gives three decimals, `lastInsertRowid` handling, WAL on a named volume, the experimental warning (status in Node 24). Result decides go or switch to `better-sqlite3`. Expected: go.
- [x] SQL-01: `db.ts` as designed above, with unit tests for argument conversion, the lock (two interleaved transactions with an await inside must not interleave), rollback on error, `insertId` and `affectedRows`.
- [x] SQL-02: baseline migration and `migrate.ts`; adapt `tests/migrate.test.ts`.
- [x] SQL-03: port the call sites file by file, running the tests after each: `auth.ts`, `sites.ts`, `profile.ts`, `users.ts`, `activity.ts`, `siteadmin.ts`, `scripts/admin.ts`. Only SQL strings and the awaits audit from the constraints change. No behavior change.
- [x] SQL-04: integration tests (`mysql.integration.ts`, `profile.integration.ts`, `users.integration.ts`, `http.smoke.ts`) run against a temporary SQLite file, so no Docker is needed. Rename the script `test:mysql` to `test:integration`, and delete `scripts/test-mysql.ts` (replaced by a small runner). The race tests (login against password change, last global admin, invitation reuse) must stay and pass; they are the main proof that the lock replaces `FOR UPDATE`.
- [x] SQL-05: `compose.yaml`: service `app` with volume `admin-data:/app/data` and `DATABASE_PATH=/app/data/admin.sqlite`; the `db` service moves under `profiles: [legacy]` (still present for the import, not started by default). `Dockerfile`: create `/app/data` owned by `node`. `.env.example` and README: remove `MYSQL_*` and `DATABASE_URL`, add `DATABASE_PATH`. The CI step `npm run test:mysql` becomes `npm run test:integration`.
- [x] SQL-06: CLI command `npm run admin backup <file>` (uses `VACUUM INTO`), and the README section: backup, restore (stop app, replace the file), single instance rule.
- [x] SQL-07: `scripts/import-mysql.ts`, a one-off import (keeps `mysql2` as a temporary dependency in this PR only). Copies users, sites, grants, backup_codes, invitations, audit with their ids preserved, computes `url_hash` as SHA-256 of the normalized base URL where it is null, skips sessions and login_attempts and expired tokens (users sign in again once). Runs in one transaction, refuses to run against a non-empty target, prints per-table counts for source and target and exits non-zero on any mismatch. Test: load a MySQL fixture (via the existing `wbdb` style container), import, compare.
- [x] SQL-08: check the framework `api-pilot` CI job (pinned framework ref) does not start the admin MySQL; it only builds the image and runs `tests/api-pilot.ts`. If it does depend on the admin database, adapt it in this PR.
- [x] SQL-09: independent review of the diff (`/code-review`) with focus on the lock, transaction boundaries and every converted `FOR UPDATE` site.

### Cutover on contabo (after PR 1 is merged)

Authorized by the owner as before. The old MySQL volume stays untouched, so rollback is always possible.

1. Back up first: `mysqldump` of `wbengine_admin` from the running `db` container to `/root` on the server (outside the volume).
2. `rsync` the new code, `docker compose build app`.
3. Brief maintenance window: `docker compose stop app`. Start the legacy database: `docker compose --profile legacy up -d db`.
4. Run the import inside the new image: `docker compose run --rm app node --experimental-strip-types scripts/import-mysql.ts` (reads `LEGACY_DATABASE_URL`, writes `/app/data/admin.sqlite`). Read the printed counts; they must match.
5. `docker compose up -d app`. Verify: `/login` returns 200, the owner signs in with password and MFA, the Users page shows all users, the Sites page lists every site and one remote call works (for example the site status), an invitation code can be created.
6. Stop the legacy database: `docker compose --profile legacy stop db`. Keep the `admin-db` volume and the dump for at least two weeks.

Rollback at any point: `git checkout` the previous release on the server, `docker compose up -d --build app` with the old compose file and `.env` (the old `DATABASE_URL`); the MySQL data was never modified, only read.

### PR 2: cleanup (after two quiet weeks, or earlier if the owner agrees)

- [ ] SQL-10: remove `mysql2`, `scripts/import-mysql.ts`, the `legacy` profile and `db` service, the `admin-db` volume reference, leftover MySQL wording in README and docs (`book-connect-a-site-end-to-end.md` still mentions `MYSQL_PASSWORD` and `DATABASE_URL`).
- [ ] SQL-11: on the server remove the `admin-db` volume and the old `.env` keys only after the owner confirms.
- [ ] SQL-12: update the project memory file about operations (deploy and migration commands changed).

## Acceptance criteria

- `npm test`, `npm run check`, `npm run build` and `npm run test:integration` are green locally and in CI, and the CI job no longer pulls or starts a MySQL image for the admin.
- Every race test that exists today still exists and passes against SQLite.
- Import counts match per table; the owner signs in after cutover; existing sites still decrypt their keys (proves `MASTER_KEY` and `key_cipher` were carried over unchanged).
- The compose project runs exactly one container; `docker compose ps` shows only `app`.
- A backup created with `npm run admin backup` opens in `node:sqlite` and has the same row counts.

## Risks and how they are covered

| Risk | Cover |
|------|-------|
| `node:sqlite` is still flagged experimental in some Node versions | SQL-00 spike on the production image; all driver use is in `db.ts`, swappable for `better-sqlite3` |
| Lost `FOR UPDATE` semantics cause a race | Global transaction lock plus `BEGIN IMMEDIATE`, race tests kept, review focus (SQL-09) |
| Slow work inside a locked transaction blocks other requests | Awaits audit in SQL-03, hashing moved out where possible |
| Time comparison bug (text vs MySQL datetime) | One fixed text format, helpers `NOW` and `minutesAgo`, tests for expiry of sessions, invitations, recovery and the rate limit window |
| Data loss during cutover | Dump before, import is read only on MySQL, old volume kept two weeks, count verification, rollback described above |
| Corruption on a bad volume | Local named volume only, WAL, `synchronous=FULL`, documented backup command and a scheduled copy |
| A second instance started by mistake | Documented; SQLite file locking prevents silent corruption, the second writer waits or fails on `busy_timeout` |

## Estimate

PR 1 is about one working day including the review, the cutover about 30 minutes, PR 2 a few minutes of work.
