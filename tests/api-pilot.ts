import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { invite, acceptInvitation, loadSession, setupMfa, completeMfa } from '../src/lib/server/auth.ts';
import { provisionSite } from '../src/lib/server/sites.ts';
import { connectContent, canOperate } from '../src/lib/server/content.ts';
import { totp } from '../src/lib/server/security.ts';
if (!process.env.DATABASE_URL?.endsWith('/wbengine_admin_pilot') || !process.env.PILOT_API_URL || !process.env.PILOT_API_KEY)
    throw Error('Pilot vyžaduje vlastní DB wbengine_admin_pilot a izolované API');
await transaction(async (c) => {
    const source = await readFile(new URL('../migrations/001-foundation.sql', import.meta.url), 'utf8');
    for (const sql of source.split(';').map(s => s.trim()).filter(Boolean))
        await c.query(sql);
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
    assert.ok(area, `Formulář ${action ?? ''} musí být dostupný`);
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
const suffix = randomBytes(6).toString('hex');
test('actual central browser forms through pinned HTTPS PHP API: drafts, conflict, merge, translations, sandbox preview, publish, revisions, structure recovery and public images', async () => {
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
    const { gateway, boxTypes } = await connectContent(session, Number(site.id));
    assert.ok(gateway.capabilities.articles.write);
    const base = '/content/' + site.id;
    response = await get(base);
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(process.env.PILOT_API_KEY!));
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
    assert.equal(decode(html.match(/<textarea\b[^>]*name="bodytext"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]??''),'Dirty <must stay> & intact');
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
    html = await (await get(base + '/articles/' + article)).text();
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
    assert.ok(html.includes('Záznam je odstraněný'));
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
    assert.ok(html.includes('Obrázek nahrán'));
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
    const editorBoot=await acceptInvitation(await invite(`editor-${suffix}@example.test`,false,Number(site.id),'editor'),'editor isolated password 123');
    const editorSession=(await loadSession(editorBoot))!,editorSecret=await setupMfa(editorSession),editorVerified=await completeMfa(editorSession,totp(editorSecret,Math.floor(Date.now()/30000)));
    jar.set('__Host-wbadmin',editorVerified.sessionToken);
    html=await(await get(base+'/articles/'+article)).text();assert.ok(!html.includes('action="?/publish"'));const beforeDenied=await gateway.get('articles',article);
    response=await post(base+'/articles/'+article+'?/publish',{...hidden(html,'save'),confirm:'yes'});assert.equal(response.status,403);assert.equal((await gateway.get('articles',article)).etag,beforeDenied.etag);
    await provisionSite('Unassigned pilot '+suffix,process.env.PILOT_API_URL!,process.env.PILOT_API_KEY!);
    const [unassigned]=await transaction(c=>rows<{id:number}>(c,'SELECT id FROM sites WHERE name=?',['Unassigned pilot '+suffix]));
    response=await get('/content/'+unassigned.id);assert.equal(response.status,403);assert.ok(!(await response.text()).includes(process.env.PILOT_API_KEY!));

});
