import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { invite, acceptInvitation, loadSession, setupMfa } from '../src/lib/server/auth.ts';
import { database, transaction } from '../src/lib/server/db.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { totp } from '../src/lib/server/security.ts';
await transaction(async (c) => { await migrate(c); });
const socket = createServer();
await new Promise<void>(r => socket.listen(0, '127.0.0.1', r));
const port = (socket.address() as import('node:net').AddressInfo).port;
await new Promise<void>(r => socket.close(() => r()));
const transport = `http://127.0.0.1:${port}`, origin = `https://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['build'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin }, stdio: 'ignore' });
after(async () => {
    child.kill("SIGKILL");
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
const jar = new Map();
function cookies(response: Response) {
    for (const value of response.headers.getSetCookie()) {
        const [pair] = value.split(';'), i = pair.indexOf('=');
        jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
async function get(path: string) {
    const r = await fetch(transport + path, { redirect: 'manual', headers: { accept: "text/html", cookie: cookieHeader() } });
    cookies(r);
    return r;
}
async function post(path: string, data: Record<string, string>, requestOrigin = origin) {
    const r = await fetch(transport + path, { method: 'POST', redirect: 'manual', headers: { accept: "text/html", cookie: cookieHeader(), origin: requestOrigin }, body: new URLSearchParams(data) });
    cookies(r);
    return r;
}
const csrfFrom = (html: string) => html.match(/name="csrf" value="([^"]+)"/)?.[1];
test('HTTP SSR login, CSRF, secure cookies, mandatory MFA and registry access', async () => {
    const denied = await get('/sites');
    assert.equal(denied.status, 303);
    assert.equal(denied.headers.get('location'), '/login');
    const loginPage = await get('/login'), html = await loginPage.text();
    assert.equal(loginPage.headers.get('cache-control'), 'no-store');
    // no-referrer would make the browser send Origin: null on a POST form, which the SvelteKit CSRF check rejects.
    assert.equal(loginPage.headers.get('referrer-policy'), 'same-origin');
    assert.ok(!html.includes('key_cipher'));
    // The icon of the application is public (no session) and declared in every page head.
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="(?:\.\/|\/)favicon\.svg"/);
    assert.match(html, /rel="apple-touch-icon" href="(?:\.\/|\/)apple-touch-icon\.png"/);
    for (const [path, type] of [['/favicon.svg', 'image/svg+xml'], ['/favicon.ico', 'image/'], ['/apple-touch-icon.png', 'image/png']]) {
        const icon = await fetch(transport + path, { redirect: 'manual' });
        assert.equal(icon.status, 200, path);
        assert.ok((icon.headers.get('content-type') ?? '').startsWith(type), path);
    }
    assert.ok(loginPage.headers.getSetCookie().every(c => c.includes('Secure') && c.includes('HttpOnly') && c.includes('SameSite=Strict')));
    let csrf = csrfFrom(html)!;
    assert.ok(csrf);
    assert.equal((await post('/login', { csrf, email: 'x@example.test', password: 'invalid' }, 'https://evil.example')).status, 403);
    const email = `http-${randomBytes(6).toString('hex')}@example.test`, password = 'http fixture password 123';
    const bootstrap = await acceptInvitation(await invite(email, true), password), session = await loadSession(bootstrap), secret = await setupMfa(session!);
    const logged = await post('/login', { csrf, email, password });
    assert.equal(logged.status, 303, `login response ${logged.status}; location ${logged.headers.get('location')}; body ${String(await logged.clone().text()).slice(0, 180)}`);
    assert.equal(logged.headers.get('location'), '/mfa');
    assert.ok(logged.headers.getSetCookie().some(c => c.startsWith('__Host-wbadmin=') && c.includes('Secure') && c.includes('HttpOnly')));
    assert.equal((await get('/sites')).headers.get('location'), '/mfa');
    const mfaPage = await get('/mfa');
    csrf = csrfFrom(await mfaPage.text())!;
    assert.ok(csrf);
    const preToken = jar.get('__Host-wbadmin');
    const verified = await post('/mfa?/verify', { csrf, code: totp(secret, Math.floor(Date.now() / 30000)) });
    assert.equal(verified.status, 200);
    assert.notEqual(jar.get('__Host-wbadmin'), preToken);
    const registry = await get('/sites');
    assert.equal(registry.status, 200);
    const registryHtml = await registry.text();
    assert.ok(registryHtml.includes('Site registry'));
    assert.ok(registryHtml.includes('Add site'));
    assert.ok(/<input\b(?=[^>]*\bname="key")(?=[^>]*\btype="password")(?=[^>]*\bautocomplete="off")/.test(registryHtml));
    assert.ok(!/name="key"[^>]*value=/.test(registryHtml));
    assert.ok(!registryHtml.includes('key_cipher'));
    // The message catalog mentions the key prefix; only an actual key (prefix plus secret body) is a leak.
    assert.ok(!/wbv2_[A-Za-z0-9_-]{20,}/.test(registryHtml));
    const profile = await get('/profile');
    assert.equal(profile.status, 200);
    const profileHtml = await profile.text();
    assert.ok(profileHtml.includes('Recent activity') && profileHtml.includes('Signed in with password'));
    assert.ok(profileHtml.includes('Showing 1 to'));
    const filtered = await (await get('/profile?activity=sites&activityPage=999')).text();
    assert.ok(filtered.includes('No activity of this type.') || filtered.includes('Showing'));
    assert.equal((await get('/profile?activity=%27%3B--&activityPage=-4')).status, 200);
    const users = await get('/users?q=http-');
    assert.equal(users.status, 200);
    const usersHtml = await users.text();
    assert.ok(usersHtml.includes('Invite a user') && usersHtml.includes(email));
    assert.equal((await get('/users?page=-3&q=%25')).status, 200);
    assert.equal((await get('/users/999999')).status, 404);
    assert.equal((await get('/users/abc')).status, 404);
    csrf = csrfFrom(await (await get('/')).text())!;
    assert.equal((await post('/?/logout', { csrf })).status, 303);
    assert.equal((await get('/sites')).headers.get('location'), '/login');
});
test('interface language follows the cookie, then Accept-Language, and falls back to English', async () => {
    const page = async (headers: Record<string, string>) => (await fetch(transport + '/login', { headers: { accept: 'text/html', ...headers } })).text();
    const english = await page({});
    assert.match(english, /<html lang="en">/);
    assert.ok(english.includes('Sign in'));
    const czech = await page({ 'accept-language': 'cs-CZ,cs;q=0.9,en;q=0.5' });
    assert.match(czech, /<html lang="cs">/);
    assert.ok(czech.includes('Přihlášení'));
    const german = await page({ 'accept-language': 'cs', cookie: 'wb_locale=de' });
    assert.match(german, /<html lang="de">/);
    assert.ok(german.includes('Anmelden'));
    assert.match(await page({ 'accept-language': 'fr', cookie: 'wb_locale=xx' }), /<html lang="en">/);
});
