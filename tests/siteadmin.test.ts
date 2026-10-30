import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsersQuery, projectUser, projectLink, validateUserPage, projectConfig, canManageUsers, canFlushCache, canReadConfig, createSiteAdminGateway } from '../src/lib/server/siteadmin.ts';
import { planApiCall, RemoteFailure } from '../src/lib/server/api-contract.ts';

const user = { id: 3, email: 'a@example.com', username: 'a@example.com', firstname: null, lastname: 'Ng', role: 'editor', disabled: false };
const token = 'a'.repeat(64);

test('the user list query is bounded', () => {
    assert.deepEqual(parseUsersQuery(new URLSearchParams('')), { page: 1, search: null, role: null });
    assert.deepEqual(parseUsersQuery(new URLSearchParams('q= ann &role=admin&page=4')), { page: 4, search: 'ann', role: 'admin' });
    assert.deepEqual(parseUsersQuery(new URLSearchParams('role=root&page=-1&q=' + 'x'.repeat(300))).role, null);
    assert.equal(parseUsersQuery(new URLSearchParams('q=' + 'x'.repeat(300))).search?.length, 100);
});

test('user requests carry only allowed fields', () => {
    assert.equal(planApiCall({ operation: 'usersList', page: 2, users: { search: 'a b', role: 'editor' } }).path, 'users?page=2&per_page=25&search=a+b&role=editor');
    assert.throws(() => planApiCall({ operation: 'usersList', users: { role: 'root' } }));
    assert.deepEqual(planApiCall({ operation: 'userUpdate', id: '3', data: { role: 'user', disabled: true } }), { path: 'users/3', method: 'PATCH', data: { role: 'user', disabled: true } });
    for (const data of [{ password: 'x' }, { email: 'e@example.com' }, { id: 1 }]) assert.throws(() => planApiCall({ operation: 'userUpdate', id: '3', data }));
    assert.throws(() => planApiCall({ operation: 'userCreate', data: { email: 'a@example.com', password: 'secret' } }));
    assert.throws(() => planApiCall({ operation: 'userGet', id: '3/../../x' }));
    assert.equal(planApiCall({ operation: 'userReset', id: '7' }).path, 'users/7/password-reset');
    assert.deepEqual(planApiCall({ operation: 'cacheFlush' }), { path: 'cache/flush', method: 'POST', data: {} });
    assert.equal(planApiCall({ operation: 'siteConfig' }).path, 'config');
});

test('responses are projected and malformed ones rejected', () => {
    assert.deepEqual(projectUser({ ...user, password: 'leak', disabled_at: 5 }), user);
    assert.throws(() => projectUser({ ...user, role: 'root' }));
    assert.throws(() => projectUser({ ...user, email: 'x'.repeat(101) }));
    assert.equal(projectLink({ token, expires_at: 1790000000 }).token, token);
    assert.throws(() => projectLink({ token: 'short', expires_at: 1 }));
    const page = validateUserPage({ data: [user], pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 }, path: '', method: 'GET' } as never);
    assert.equal(page.total, 1);
    assert.throws(() => validateUserPage({ data: 'x', pagination: {} } as never));
    assert.deepEqual(projectConfig({ a: { b: [1, 'x'], c: 'set' } }), { a: { b: [1, 'x'], c: 'set' } });
    assert.throws(() => projectConfig({ f: () => 1 }));
});

test('access needs a manager role, the scope and the capability', () => {
    const caps = { users: { read: true, write: true }, cache: { write: true }, config: { read: true } };
    const all = ['users:read', 'users:write', 'cache:write', 'config:read'];
    assert.deepEqual(canManageUsers('siteadmin', all, caps), { read: true, write: true });
    assert.deepEqual(canManageUsers('siteadmin', ['users:read'], caps), { read: true, write: false });
    assert.deepEqual(canManageUsers('editor', all, caps), { read: false, write: false });
    assert.deepEqual(canManageUsers('global', all, { users: { read: true, write: false } }), { read: true, write: false });
    assert.equal(canFlushCache('global', all, caps), true);
    assert.equal(canFlushCache('editor', all, caps), false);
    assert.equal(canReadConfig('siteadmin', [], caps), false);
});

test('the gateway enforces access before any call and reads the one-time link from the reply', async () => {
    const calls: string[] = [];
    const call = async (c: { operation: string }) => {
        calls.push(c.operation);
        return { data: c.operation === 'userCreate' ? { ...user, password_setup: { token, expires_at: 1790000000 } } : { settings: { jwtSecret: 'set', timeZone: 'Europe/Prague' } }, path: '', method: 'POST' } as never;
    };
    const caps = { users: { read: true, write: true }, config: { read: true } };
    const g = createSiteAdminGateway({ role: 'siteadmin', scopes: ['users:read', 'users:write', 'config:read'], capabilities: caps, call });
    const created = await g.create({ email: 'a@example.com', role: 'editor' });
    assert.equal(created.link.token, token);
    assert.deepEqual(await g.config(), { jwtSecret: 'set', timeZone: 'Europe/Prague' });
    const locked = createSiteAdminGateway({ role: 'editor', scopes: ['users:read'], capabilities: caps, call });
    await assert.rejects(locked.create({ email: 'a@example.com', role: 'user' }), (e) => e instanceof RemoteFailure && e.status === 403);
    assert.deepEqual(calls, ['userCreate', 'siteConfig']);
    const oldKey = createSiteAdminGateway({ role: 'siteadmin', scopes: ['discovery:read'], capabilities: caps, call });
    assert.equal(oldKey.needsNewKey(), true);
});
