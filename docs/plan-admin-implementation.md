# WBengine Admin Plan

A standalone central SvelteKit administration for multiple WBengine 4 sites via API v2. Content stays on the sites, and integration keys live exclusively on the central server. The PHP core keeps the Application/Site/Section/Box tree. The current administration release is `v0.2.0`; the repo remains private.

- [x] ADM-01: project, MySQL, Docker, explicit CLI migrations.
- [x] ADM-02: invitations, scrypt, TOTP, backup codes, recovery, sessions, CSRF, per-site roles, concurrency regressions.
- [x] ADM-03: registry, encrypted keys, CLI provisioning, HTTPS client with pinned DNS and an overall deadline, discovery.
- [x] ADM-04: content editor, structure, translations, registered boxes, images.
- [x] ADM-05: private previews, drafts, publishing, revisions, conflicts, structure recovery.
- [x] REL-01: technical gate, merge into `main` and private GitHub Release `v0.1.0` completed. The repository and the administration remain private; further distribution will be handled separately.

## Procedure

After each phase: tests, plan update, commit and push to the working branch. No keys or operational data in Git. Every server call checks the current session, permissions and the final allowlist of operations. The browser receives only public DTOs. No automatic merge or deploy.

## Distribution and checkpoint 2026-10-27

Decision: the administration is a standalone tool in the `wbengine-admin` repository, not part of the WBengine PHP/Composer package. The core stays a small PHP framework; the SvelteKit administration runs as a separate Node/Docker service with its own MySQL database and connects to multiple sites through their API v2. The repository stays private. The framework, the administration and any Docker images have independent versions. The first private source release is tagged `v0.1.0`; public disclosure and image publication were not approved.

The local checkout is in `/Users/roza/Sites/svelte/wbengine-admin`. The branch `codex/wbengine-4.0` was fast-forwarded into `main` at commit `7eb0870`, and the final suite was verified: `npm test` 34/34, `npm run check` 0 errors and 0 warnings, production build successful, `npm run test:mysql` 5 database tests and 1 HTTP/MFA test green. An earlier CI run 40360443062 contains the two-site HTTPS API pilot, key revocation, and database outage and recovery. Production APIs and data were not tested with write requests.

PR #1 was subsequently merged into `main`; the Git remote confirmed merge commit `a74892a`. The private GitHub Release `v0.1.0` was created and verified with the `gh release list` and `gh release view` commands. The release points to tag `v0.1.0` and commit `7eb0870`. The repository and the administration remain private; the container was not published.

## Checkpoint 2026-10-26

ADM-01/02/03 implemented and independently reviewed. The review of the login race with a password change/deactivation and of the overall deadline was resolved through RED/GREEN regressions. The parent verified 17 unit tests, 5 real MySQL scenarios including two concurrency ones, and 1 HTTP scenario for CSRF, secure cookies, MFA and rotation. Svelte check with 0 errors/0 warnings and the production build passed. The dedicated temporary Compose project was removed.

The next step is ADM-04/05 following Api/V2.php, Resources, ContentModel and ImageModel of the working core. Configuration and operational boundaries are in README.md. The major version is in progress.


## ADM-04/05 checkpoint 2026-10-26

Server-side finite ApiClient/ContentGateway and a site selection UI, paginated collections/detail/create, editing of structure and articles, translations, images, draft/preview/publish/revisions and structural recovery. Every operation checks the central role, the API scope and the discovery capability. Integration keys stay on the server; a foreign endpoint is a finite plan of operations. The preview has an iframe sandbox and a CSP without scripts or external media.

A 412 conflict triggers no automatic retry, preserves the exact dirty texts and the old ETag. An explicit merge only loads the current state/ETag, and the actual write happens only after a subsequent check. Structure recovery uses its own changes ETag. The upload limit is 1 MiB of JSON for a 512 KiB raster image, and the public nature of media is stated in the UI.

The review found that required JSON keys were being used as nonempty HTML `required`, which blocked valid empty article texts and partial translations. A truly compiled SSR component test was first 3 RED, and after the fix 4 GREEN. The independent scoped review accepted the fix. The server still sends the required JSON keys; link/key/type have their own semantic checks.

The parent verified 33 unit/transport/action/component tests, Svelte check with 0 errors/0 warnings, the production build and the Node 24 Docker image. Before the UI fix there were also 5 real MySQL + 1 auth HTTP green; the fix changes only HTML constraints. After the fix, the real central HTML -> verified pinned HTTPS -> PHP API pilot 1/1 GREEN: login/MFA, create page/article, translation/private preview, concurrent 412 and preserved textarea, explicit merge, save/publish/revision restore, structural delete/undo including translation, menu/section/box CRUD, image CRUD, editor publish 403 and foreign site 403. Basic TLS provider probe 2/2 GREEN including rejection without an explicit CA.

The pilot uses Node fetch against the real SSR forms; it is not graphical Chromium automation. The final release gate extends verification to two truly separate API databases/keys, revocation and outages. No merge/tag/deployment yet. The commit/push of this phase and CI follow.


## REL-01, two truly separate sites and outages

2026-10-26: the parent verified 34 unit/transport/action/SSR component tests, check 0/0 and the latest production Docker build. The real dual-site HTML pilot 1/1 GREEN (~14.05s) through a wrapper in the core: two separate DB/user/key sites, cross-key 401, editor of site 1 rejected on site 2, site 2 outage while site 1 keeps running, preserved dirty text and original ETag, return without an automatic write and only then a manual retry, revoked key 401 with no effect on site 1. After SIGKILL of the central process both public sites continue to return 200.

The pilot uncovered a real bug: a new PageServerLoad with a dead API overrode the action fail. The request-local fallback now keeps only the locally authorized site ID/name/role and the submitted string fields, never keys/gateway/exception. It works only for the same POST and route. The following POST again performs a fresh session/grants/CSRF/scopes/capabilities/ETag check. Independent scoped review with no blockers, actual RED/GREEN and a new unit test.

Provider probe 3/3 GREEN, DB dump/restore 17 tables/861 rows: the same defaults/definitions/hashes of all rows, the helper DB/dump removed. All of this was isolated tests only. A new separate CI job downloads the public framework branch, builds the images, runs start/probe/consumer/backup-check and always a reset. The runtime is not in Git and no key is printed.

The implementation and the technical gate are done; what remains is verification of this new CI and the final decision on merge/tag/release 4.0.0. No production data or deployment was touched. The shared current state is also kept in plan-framework-improvements.md in the framework repo.


## Final remote verification

Administration 287274d: both GitHub jobs GREEN in run 40360443062, including the real Two-site PHP API pilot (2m18s) with outage/revocation and dump/restore. Core 0c15eba has all 7 jobs GREEN; the last documentation checkpoint is d99d088, and the current proof is in the shared plan. Skeleton 95ce7cf additionally has an actual source HTML migration smoke test: 18 plans on TEMP copies, 8 safe apply/rollback and 10 manual review without overwriting the originals.

The implementation and technical tests are complete, framework v4.0.0 is released, and what remains is the merge of the administration and publication of its repository. The administration merge has not happened yet; the core tag v4.0.0 exists; no production deploy or overwriting of real operational data took place. The release materials and the operator playbook are in the framework repo. This last commit only completes the final state of the plan.


## Publication

2026-10-27: The WBengine core was merged into master as cf710e5adbc25809868a864e615f8b9fc62a7489 and the tag v4.0.0 is published. The CI integration pilot uses the stable tag, not the development branch. The administration was merged into `main` and the private release v0.1.0 is published. No production deployment was performed.

## Analytics and test status 2026-10-28

This item replaces the earlier status notes about the unfinished connection of Admin to the site. WBengine Admin `v0.2.0` contains the dashboard `/analytics/{id}`. Access is checked simultaneously against the central grant, the scope `analytics:read` and the remote capability `analytics.read`. CI verified the analytics transport and the private two-site API pilot; the last local Admin suite had 43 tests, Svelte check with no errors or warnings, and a successful production build.

The local Docker instance of Admin runs only on the loopback of the development machine. The local HTTPS proxy at `https://localhost:13443` returns a redirect to login, and the login form returns HTTP 200. The first account is created by a one-time invitation outside Git; before use, a password and mandatory MFA are set. The way the invitation is handed over, and any secrets, do not belong in the repository.

For interactive checking of the analytics dashboard, `WBengine Analytics Test` is now also in the local Admin registry. It is a test site from an isolated two-site HTTPS pilot network with prefilled aggregated metrics, not the production WBengine.org. The test API key has read-only permission and stays in the local Admin DB; the CA, keys and databases of the pilot are under `tests/pilot/runtime/`, ignored by Git. The pilot stack is left running for user testing. After it ends, it can be safely removed via `sh tests/pilot/pilot.sh reset` from the WBengine checkout.

WBengine.org is connected in the registry as a read-only site. The pinned HTTPS client verified the capability, the identity and the reading of the article collection. The integration key contains only read permissions, including `analytics:read`, with no write scope. However, the public site now reports `analytics.read=false`, because native collection remains disabled; the dashboard therefore correctly shows analytics as unavailable for this site. Google Analytics remains active. Enabling native collection and the subsequent operational comparison with GA4 are a separate step, to be done only after the updated privacy notice is verified and the operator explicitly decides.

The new VPS has in its active configuration the exact trusted proxy `172.18.0.1/32` and the headers `x-forwarded-for` and `x-forwarded-proto`; after the web container restart, the API identity passed over HTTPS. The original `docker.rrsoft.cz` was not modified. Access via the alias `docker-rrsoft` was previously verified as user `roza`; on the last repeat, DNS resolution failed even before SSH authentication.

Remaining user test: accept the local one-time invitation, log in with MFA, verify the site list, read-only content and the dashboard on `WBengine Analytics Test`. On the production WBengine.org, analytics stays disabled until native collection is enabled separately.
