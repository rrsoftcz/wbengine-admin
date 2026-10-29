import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { apiCall, RemoteFailure } from '../src/lib/server/remote.ts';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { invite, acceptInvitation, loadSession, setupMfa, completeMfa } from '../src/lib/server/auth.ts';
import { provisionSite } from '../src/lib/server/sites.ts';
import { connectContent, canOperate } from '../src/lib/server/content.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { totp } from '../src/lib/server/security.ts';
if (!process.env.DATABASE_URL?.endsWith('/wbengine_admin_pilot') || !process.env.PILOT_API_URL || !process.env.PILOT_API_KEY)
    throw Error('The pilot requires its own wbengine_admin_pilot DB and an isolated API');
await transaction(async (c) => {
    await migrate(c);
});
const socket = createServer();
await new Promise<void>(r => socket.listen(0, '127.0.0.1', r));
const port = (socket.address() as import('node:net').AddressInfo).port;
await new Promise<void>(r => socket.close(() => r()));
const transport = `http://127.0.0.1:${port}`, origin = `https://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['build'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin, BODY_SIZE_LIMIT: '1048576' }, stdio: 'ignore' });
after(async () => {
    child.kill('SIGKILL');
    await database().end();
});
for (let n = 0; n < 100; n++) {
    try {
        if ((await fetch(transport + '/login')).ok)
            break;
    }
    catch {
    }
    await new Promise(r => setTimeout(r, 50));
}
const jar = new Map<string, string>();
function cookies(r: Response) {
    for (const cookie of r.headers.getSetCookie()) {
        const pair = cookie.split(';')[0], i = pair.indexOf('=');
        jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
async function get(path: string) {
    const r = await fetch(transport + path, { redirect: 'manual', headers: { Accept: 'text/html', Cookie: cookieHeader() } });
    cookies(r);
    return r;
}
async function post(path: string, data: Record<string, string> | FormData) {
    const r = await fetch(transport + path, { method: 'POST', redirect: 'manual', headers: { Accept: 'text/html', Cookie: cookieHeader(), Origin: origin }, body: data instanceof FormData ? data : new URLSearchParams(data) });
    cookies(r);
    return r;
}
function decode(s: string) {
    return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function hidden(html: string, action?: string) {
    const area = action ? html.match(new RegExp('<form\\b[^>]*action="\\?/' + action + '"[^>]*>([\\s\\S]*?)</form>'))?.[1] : html;
    assert.ok(area, `The ${action ?? ''} form must be available`);
    const fields: Record<string, string> = {};
    for (const match of area.matchAll(/<input\b[^>]*>/g)) {
        const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
        if (attrs.type === 'hidden' && attrs.name)
            fields[attrs.name] = attrs.value ?? '';
    }
    return fields;
}
function redirectId(r: Response, resource: string) {
    assert.equal(r.status, 303);
    const location = r.headers.get('location')!;
    assert.ok(location.includes('/' + resource + '/'));
    return location.split('/').at(-1)!.split('?')[0];
}
async function control(action: 'stop-second' | 'start-second' | 'revoke-second') {
    const root = process.env.PILOT_CONTROL_DIR;
    if (!root)
        throw Error('Missing finite pilot controls');
    const done = join(root, action + '.done');
    await rm(done, { force: true });
    await writeFile(join(root, action + '.request'), 'go');
    for (let n = 0; n < 300; n++) {
        try {
            const reply = (await readFile(done, 'utf8')).trim();
            if (reply === 'ok')
                return;
            throw Error('Pilot control failed');
        }
        catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ENOENT')
                throw cause;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Pilot control timeout');
}
function assertSafe(html: string) {
    for (const key of [process.env.PILOT_API_KEY, process.env.PILOT_SECOND_API_KEY, process.env.MASTER_KEY])
        if (key)
            assert.ok(!html.includes(key), 'No integration or master key may appear in HTML');
}
const suffix = randomBytes(6).toString('hex');
test('actual central forms across two independent HTTPS PHP APIs: editing, grants, outage recovery, revoked key and central failure', async () => {
    const email = `pilot-${suffix}@example.test`, password = 'pilot isolated password 1234';
    const boot = await acceptInvitation(await invite(email, true), password), secret = await setupMfa((await loadSession(boot))!);
    let response = await get('/login'), html = await response.text();
    response = await post('/login', { ...hidden(html), email, password });
    assert.equal(response.status, 303);
    html = await (await get('/mfa')).text();
    response = await post('/mfa?/verify', { ...hidden(html, 'verify'), code: totp(secret, Math.floor(Date.now() / 30000)) });
    assert.equal(response.status, 200);
    const session = (await loadSession(jar.get('__Host-wbadmin')))!;
    assert.equal(session.mfaVerified, true);
    await provisionSite('PHP pilot ' + suffix, process.env.PILOT_API_URL!, process.env.PILOT_API_KEY!);
    const [site] = await transaction(c => rows<{
        id: number;
    }>(c, 'SELECT id FROM sites WHERE name=?', ['PHP pilot ' + suffix]));
    const { gateway, boxTypes, analytics } = await connectContent(session, Number(site.id));
    assert.ok(gateway.capabilities.articles.write);
    assert.ok(analytics?.canRead());
    const today = new Date().toISOString().slice(0, 10);
    const firstOverview = await analytics!.overview({ from: today, to: today, granularity: 'day' });
    assert.ok(firstOverview.totals.page_views >= 2);
    assert.ok(firstOverview.totals.article_views >= 1);
    assert.ok(firstOverview.totals.box_appearances >= 3);
    assert.ok(firstOverview.lifetime_totals.article_views >= 100);
    assert.ok(firstOverview.top_pages.some(item => item.title === 'Published pilot article'));
    await provisionSite('PHP second analytics pilot ' + suffix, process.env.PILOT_SECOND_API_URL!, process.env.PILOT_SECOND_API_KEY!);
    const [analyticsPilotSecondSite] = await transaction(c => rows<{ id: number }>(c, 'SELECT id FROM sites WHERE name=?', ['PHP second analytics pilot ' + suffix]));
    const analyticsSecondConnection = await connectContent(session, Number(analyticsPilotSecondSite.id));
    const secondOverview = await analyticsSecondConnection.analytics!.overview({ from: today, to: today, granularity: 'day' });
    assert.ok(secondOverview.top_pages.some(item => item.title === 'Published second pilot article'));
    assert.ok(!secondOverview.top_pages.some(item => item.title === 'Published pilot article'));
    const base = '/content/' + site.id;
    response = await get(base);
    assert.equal(response.status, 200);
    html = await response.text();
    assert.ok(!(html).includes(process.env.PILOT_API_KEY!));
    assert.ok(html.includes('/analytics/' + site.id));
    response = await get('/analytics/' + site.id + '?from=2026-02-30&to=2026-03-01');
    assert.equal(response.status, 400);
    response = await get('/analytics/' + site.id + '?from=' + today + '&to=' + today + '&granularity=day');
    assert.equal(response.status, 200);
    html = await response.text();
    assert.ok(html.includes('Analytika: PHP pilot ' + suffix));
    assert.ok(html.includes('Since measuring began'));
    assertSafe(html);
    html = await (await get(base + '/pages/new')).text();
    response = await post(base + '/pages/new?/save', { ...hidden(html, 'save'), parent_id: '0', link: '/pilot-' + suffix, title: 'Pilot page', strict: '1', visible: '1', html_title: '', html_description: '', html_keywords: '', acl: '0' });
    const page = redirectId(response, 'pages');
    html = await (await get(base + '/articles/new')).text();
    response = await post(base + '/articles/new?/save', { ...hidden(html, 'save'), site_id: page, title: 'Original draft ' + suffix, introtext: '**Intro**', bodytext: 'Private initial body', content_format: 'markdown', author: 'Fixture', source: '' });
    const article = redirectId(response, 'articles');
    let row = (await gateway.get('articles', article)).data as {
        title: string;
        draft: {
            content: {
                title: string;
                bodytext: string;
            };
        } | null;
    };
    assert.equal(row.title, '');
    assert.equal(row.draft?.content.title, 'Original draft ' + suffix);
    html = await (await get(base + '/articles/' + article + '?locale=en')).text();
    response = await post(base + '/articles/' + article + '?/translationSave', { ...hidden(html, 'translationSave'), title: 'English title', introtext: 'English intro', bodytext: 'English body', content_format: 'markdown' });
    assert.equal(response.status, 303);
    assert.equal(((await gateway.translation('articles', article, 'en')).data as {
        title: string;
    }).title, 'English title');
    response = await get(base + '/articles/' + article + '/preview?locale=en');
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-security-policy')?.includes('sandbox'));
    assert.ok(response.headers.get('content-security-policy')?.includes("default-src 'none'"));
    assert.ok((await response.text()).includes('English body'));
    html = await (await get(base + '/articles/' + article)).text();
    const stale = hidden(html, 'save'), before = await gateway.get('articles', article);
    await gateway.save('articles', article, { title: 'Concurrent title' }, before.etag!);
    response = await post(base + '/articles/' + article + '?/save', { ...stale, site_id: page, title: 'Dirty local title', introtext: 'Dirty intro', bodytext: 'Dirty <must stay> & intact', content_format: 'markdown', author: 'Fixture', source: '' });
    assert.equal(response.status, 412);
    html = await response.text();
    assert.equal(decode(html.match(/<textarea\b[^>]*name="bodytext"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? ''), 'Dirty <must stay> & intact');
    assert.equal(hidden(html, 'save').etag, stale.etag);
    assert.ok(!html.includes(process.env.PILOT_API_KEY!));
    response = await post(base + '/articles/' + article + '?/merge', { ...hidden(html, 'save'), site_id: page, title: 'Dirty local title', introtext: 'Dirty intro', bodytext: 'Dirty <must stay> & intact', content_format: 'markdown', author: 'Fixture', source: '', mergeConsent: 'yes' });
    assert.equal(response.status, 200);
    html = await response.text();
    assert.equal(((await gateway.get('articles', article)).data as {
        draft: {
            content: {
                title: string;
            };
        };
    }).draft.content.title, 'Concurrent title');
    assert.notEqual(hidden(html, 'save').etag, stale.etag);
    response = await post(base + '/articles/' + article + '?/save', { ...hidden(html, 'save'), site_id: page, title: 'Dirty local title', introtext: 'Dirty intro', bodytext: 'Dirty <must stay> & intact', content_format: 'markdown', author: 'Fixture', source: '' });
    assert.equal(response.status, 303);
    html = await (await get(base + '/articles/' + article)).text();
    response = await post(base + '/articles/' + article + '?/publish', { ...hidden(html, 'publish'), confirm: 'yes' });
    assert.equal(response.status, 303);
    row = (await gateway.get('articles', article)).data as typeof row;
    assert.equal(row.title, 'Dirty local title');
    assert.equal(row.draft, null);
    const revisions = (await gateway.history('articles', article)).data as {
        revision_id: number;
    }[];
    assert.ok(revisions.length >= 4);
    html = await (await get(base + '/articles/' + article + '?history=1')).text();
    response = await post(base + '/articles/' + article + '?/restore', { ...hidden(html, 'restore'), change_id: String(revisions.at(-1)!.revision_id), confirm: 'yes' });
    assert.equal(response.status, 303);
    row = (await gateway.get('articles', article)).data as typeof row;
    assert.equal(row.title, 'Dirty local title');
    assert.equal(row.draft?.content.title, 'Original draft ' + suffix);
    html = await (await get(base + '/pages/new')).text();
    response = await post(base + '/pages/new?/save', { ...hidden(html, 'save'), parent_id: '0', link: '/recover-' + suffix, title: 'Recoverable page', strict: '1', visible: '1', html_title: '', html_description: '', html_keywords: '', acl: '0' });
    const recoverable = redirectId(response, 'pages');
    html = await (await get(base + '/pages/' + recoverable + '?locale=en')).text();
    response = await post(base + '/pages/' + recoverable + '?/translationSave', { ...hidden(html, 'translationSave'), title: 'Recovered English', html_title: 'English SEO', html_description: '', html_keywords: '' });
    assert.equal(response.status, 303);
    html = await (await get(base + '/pages/' + recoverable)).text();
    response = await post(base + '/pages/' + recoverable + '?/delete', { ...hidden(html, 'delete'), confirm: 'yes' });
    assert.equal(response.status, 303);
    html = await (await get(base + '/pages/' + recoverable)).text();
    assert.ok(html.includes('The record has been removed'));
    html = await (await get(base + '/pages/' + recoverable + '?history=1')).text();
    response = await post(base + '/pages/' + recoverable + '?/restore', { ...hidden(html, 'restore'), confirm: 'yes' });
    assert.equal(response.status, 303);
    assert.equal(((await gateway.get('pages', recoverable)).data as {
        title: string;
    }).title, 'Recoverable page');
    assert.equal(((await gateway.translation('pages', recoverable, 'en')).data as {
        title: string;
    }).title, 'Recovered English');
    for (const resource of ['menu', 'sections', 'boxes'] as const) {
        if (!gateway.capabilities[resource]?.write)
            continue;
        let data: Record<string, unknown> = resource === 'menu' ? { site_id: Number(page), name: 'Pilot menu', visible: 1, parent: 0, order: 1, type: 0 } : resource === 'sections' ? { key: 'pilot_' + suffix, title: 'Pilot section', active: 1, return_error_code: 0 } : { name: 'Pilot box', type: boxTypes[0]?.type, section_id: 0, settings: {}, sites: [], static: 0, shared: 0, order: 0, device_min: 0, device_strict: 0 };
        if (resource === 'boxes') {
            const sectionKey = boxTypes[0]?.sections[0] ?? 'central';
            const existing = ((await gateway.list('sections')).data as {
                key: string;
                section_id: number;
            }[]).find(x => x.key === sectionKey);
            const section = existing ?? (await gateway.save('sections', null, { key: sectionKey, title: 'Central', active: 1, return_error_code: 0 })).data as {
                section_id: number;
            };
            data.section_id = Number(section.section_id);
        }
        const created = await gateway.save(resource, null, data);
        assert.ok(created.etag);
    }
    assert.equal(gateway.capabilities.images.write, true);
    html = await (await get(base + '/images')).text();
    const imageForm = new FormData();
    for (const [key, value] of Object.entries(hidden(html, 'upload')))
        imageForm.set(key, value);
    imageForm.set('publicConsent', 'yes');
    imageForm.set('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'pilot.png');
    response = await post(base + '/images?/upload', imageForm);
    assert.equal(response.status, 200);
    html = await response.text();
    assert.ok(html.includes('Image uploaded'));
    const images = (await gateway.list('images')).data as {
        image_id: string;
    }[];
    assert.ok(images.length);
    response = await get(base + '/images/' + images.at(-1)!.image_id);
    assert.equal(response.status, 200);
    html = await response.text();
    assert.ok(html.includes('data:image/png;base64,'));
    response = await post(base + '/images/' + images.at(-1)!.image_id + '?/delete', { ...hidden(html, 'delete'), confirm: 'yes' });
    assert.equal(response.status, 303);
    await assert.rejects(gateway.get('images', images.at(-1)!.image_id));
    assert.equal(canOperate('editor', gateway.scopes, gateway.capabilities, 'publish', 'articles'), false);
    const editorBoot = await acceptInvitation(await invite(`editor-${suffix}@example.test`, false, Number(site.id), 'editor'), 'editor isolated password 123');
    const editorSession = (await loadSession(editorBoot))!, editorSecret = await setupMfa(editorSession), editorVerified = await completeMfa(editorSession, totp(editorSecret, Math.floor(Date.now() / 30000)));
    const editorAuthorization = (await loadSession(editorVerified.sessionToken))!;
    await assert.rejects(connectContent(editorAuthorization, Number(analyticsPilotSecondSite.id)), error => error instanceof RemoteFailure && error.status === 403);
    const globalToken = jar.get('__Host-wbadmin')!;
    jar.set('__Host-wbadmin', editorVerified.sessionToken);
    html = await (await get(base + '/articles/' + article)).text();
    assert.ok(!html.includes('action="?/publish"'));
    const beforeDenied = await gateway.get('articles', article);
    response = await post(base + '/articles/' + article + '?/publish', { ...hidden(html, 'save'), confirm: 'yes' });
    assert.equal(response.status, 403);
    assert.equal((await gateway.get('articles', article)).etag, beforeDenied.etag);
    assert.ok(process.env.PILOT_SECOND_API_URL && process.env.PILOT_SECOND_API_KEY && process.env.PILOT_CONTROL_DIR, 'Dual-site fixture and finite controls are required');
    // The second pilot site (registered once above, the URL is unique per site) is never granted to this member, so it doubles as the unassigned site.
    const unassigned = analyticsPilotSecondSite;
    response = await get('/content/' + unassigned.id);
    assert.equal(response.status, 403);
    const denied = await response.text();
    assert.ok(!denied.includes(process.env.PILOT_API_KEY!) && !denied.includes(process.env.PILOT_SECOND_API_KEY!));
    jar.set('__Host-wbadmin', globalToken);
    const secondSite = analyticsPilotSecondSite;
    const secondBase = '/content/' + secondSite.id, secondConnection = await connectContent(session, Number(secondSite.id)), secondGateway = secondConnection.gateway;
    const allowlist = (process.env.REMOTE_IP_ALLOWLIST ?? '').split(',');
    for (const [url, key] of [[process.env.PILOT_API_URL!, process.env.PILOT_SECOND_API_KEY!], [process.env.PILOT_SECOND_API_URL!, process.env.PILOT_API_KEY!]])
        await assert.rejects(apiCall(url, { operation: 'identity' }, key, allowlist), e => e instanceof RemoteFailure && e.status === 401);
    html = await (await get(secondBase + '/pages/new')).text();
    response = await post(secondBase + '/pages/new?/save', { ...hidden(html, 'save'), parent_id: '0', link: '/second-' + suffix, title: 'Independent second page', strict: '1', visible: '1', html_title: '', html_description: '', html_keywords: '', acl: '0' });
    const secondPage = redirectId(response, 'pages');
    html = await (await get(secondBase + '/articles/new')).text();
    response = await post(secondBase + '/articles/new?/save', { ...hidden(html, 'save'), site_id: secondPage, title: 'Independent second draft', introtext: '', bodytext: 'Second web body', content_format: 'markdown', author: 'Fixture', source: '' });
    const secondArticle = redirectId(response, 'articles');
    const secondDetail = secondBase + '/articles/' + secondArticle;
    html = await (await get(secondDetail)).text();
    response = await post(secondDetail + '?/publish', { ...hidden(html, 'publish'), confirm: 'yes' });
    assert.equal(response.status, 303);
    const firstBeforeSecondEdit = await gateway.get('articles', article), secondBeforeOutage = await secondGateway.get('articles', secondArticle);
    assert.equal((secondBeforeOutage.data as {
        title: string;
    }).title, 'Independent second draft');
    assert.equal((await gateway.get('articles', article)).etag, firstBeforeSecondEdit.etag);
    jar.set('__Host-wbadmin', editorVerified.sessionToken);
    response = await get(secondBase);
    assert.equal(response.status, 403);
    jar.set('__Host-wbadmin', globalToken);
    html = await (await get(secondDetail)).text();
    const beforeOutageForm = hidden(html, 'save');
    await control('stop-second');
    response = await get(base + '/articles/' + article);
    assert.equal(response.status, 200);
    const outageText = 'Unsaved during outage <preserve> & retry manually';
    response = await post(secondDetail + '?/save', { ...beforeOutageForm, site_id: secondPage, title: 'Unsaved outage draft', introtext: '', bodytext: outageText, content_format: 'markdown', author: 'Fixture', source: '' });
    assert.ok(response.status >= 400 && response.status < 600);
    html = await response.text();
    assertSafe(html);
    assert.equal(decode(html.match(/<textarea\b[^>]*name="bodytext"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? ''), outageText, 'outage must preserve the actual editable textarea in HTML');
    assert.equal(hidden(html, 'save').etag, beforeOutageForm.etag);
    await control('start-second');
    assert.equal((await secondGateway.get('articles', secondArticle)).etag, secondBeforeOutage.etag, 'outage must not automatically retry a write');
    response = await post(secondDetail + '?/save', { ...hidden(html, 'save'), site_id: secondPage, title: 'Recovered second draft', introtext: '', bodytext: outageText, content_format: 'markdown', author: 'Fixture', source: '' });
    assert.equal(response.status, 303);
    assert.equal((await gateway.get('articles', article)).etag, firstBeforeSecondEdit.etag);
    html = await (await get(secondDetail)).text();
    const beforeRevocation = hidden(html, 'save');
    await control('revoke-second');
    response = await post(secondDetail + '?/save', { ...beforeRevocation, site_id: secondPage, title: 'Revoked key draft', introtext: '', bodytext: 'Dirty text after revocation', content_format: 'markdown', author: 'Fixture', source: '' });
    assert.ok(response.status >= 400 && response.status < 600);
    assertSafe(await response.text());
    await assert.rejects(apiCall(process.env.PILOT_SECOND_API_URL!, { operation: 'identity' }, process.env.PILOT_SECOND_API_KEY!, allowlist), e => e instanceof RemoteFailure && e.status === 401);
    response = await get(base + '/articles/' + article);
    assert.equal(response.status, 200);
    const stopped = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await stopped;
    for (const [url, title] of [[process.env.PILOT_API_URL!, 'Published pilot'], [process.env.PILOT_SECOND_API_URL!, 'Published second pilot']]) {
        const published = await fetch(new URL('pilot/article/', url), { redirect: 'manual' });
        assert.equal(published.status, 200);
        const publicHtml = await published.text();
        assert.ok(publicHtml.includes(title));
        assertSafe(publicHtml);
    }
});
