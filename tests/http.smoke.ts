import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { invite, acceptInvitation, loadSession, setupMfa } from '../src/lib/server/auth.ts';
import { database } from '../src/lib/server/db.ts';
import { totp } from '../src/lib/server/security.ts';
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
    assert.ok(!registryHtml.includes('wbv2_'));
    csrf = csrfFrom(await (await get('/')).text())!;
    assert.equal((await post('/?/logout', { csrf })).status, 303);
    assert.equal((await get('/sites')).headers.get('location'), '/login');
});
