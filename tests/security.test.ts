import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecretVault, hashPassword, verifyPassword, tokenHash, totp, verifyTotp } from '../src/lib/server/security.ts';
import { validateBaseUrl, isPublicAddress, resolveTarget } from '../src/lib/server/remote.ts';
test('secrets authenticate context and ciphertext, never persist plaintext', () => {
    const v = new SecretVault(Buffer.alloc(32, 3));
    const c = v.encrypt('wbv2_secret', 'site:1');
    assert.ok(!c.includes('wbv2_secret'));
    assert.equal(v.decrypt(c, 'site:1'), 'wbv2_secret');
    assert.throws(() => v.decrypt(c, 'site:2'));
    assert.throws(() => v.decrypt(c.slice(0, -3) + 'abc', 'site:1'));
});
test('password hashes use salts and reject incorrect password', async () => {
    const a = await hashPassword('a long password 123');
    const b = await hashPassword('a long password 123');
    assert.notEqual(a, b);
    assert.ok(await verifyPassword('a long password 123', a));
    assert.ok(!await verifyPassword('wrong', a));
    assert.equal(tokenHash('abc').length, 64);
});
test('TOTP RFC vector and replay counter', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(totp(secret, 1), '287082');
    assert.equal(verifyTotp(secret, '287082', 59000, -1), 1);
    assert.equal(verifyTotp(secret, '287082', 59000, 1), null);
});
test('URL rejects credentials, query, fragment, HTTP and local literals', () => {
    for (const u of ['http://example.com', 'https://a:b@example.com', 'https://example.com?x=1', 'https://example.com/#x', 'https://127.0.0.1'])
        assert.throws(() => validateBaseUrl(u));
    assert.equal(validateBaseUrl('https://example.com/engine/').pathname, '/engine/');
});
test('IP policy includes IPv6 and IPv4-mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.1.1', '192.168.1.1', '198.18.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '2001:db8::1'])
        assert.equal(isPublicAddress(ip), false, ip);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
        assert.equal(isPublicAddress(ip), true, ip);
});
test('DNS rejects mixed answers and pins validated lookup to first resolution', async () => {
    let calls = 0;
    const lookup = async () => {
        calls++;
        return [{ address: calls === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }];
    };
    const target = await resolveTarget('https://example.com', [], lookup);
    assert.equal(target.address, '8.8.8.8');
    assert.equal(calls, 1);
    await assert.rejects(resolveTarget('https://example.com', [], async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]));
});
test('pinned lookup supports Node all-address lookup without resolving again', async () => {
    const { pinnedLookup } = await import('../src/lib/server/remote.ts');
    const lookup = pinnedLookup({ address: '8.8.8.8', family: 4 });
    lookup('example.com', { all: true }, (err: unknown, answers: unknown) => {
        assert.equal(err, null);
        assert.deepEqual(answers, [{ address: '8.8.8.8', family: 4 }]);
    });
    lookup('example.com', {}, (err: unknown, address: unknown, family: unknown) => {
        assert.equal(err, null);
        assert.equal(address, '8.8.8.8');
        assert.equal(family, 4);
    });
});
test('transition, documentation, benchmark and special IPv6 are denied', () => {
    for (const ip of ['2001:20::1', '2001:100::1', '3fff::1', '192.88.99.1', '2002:7f00:1::1'])
        assert.equal(isPublicAddress(ip), false, ip);
});
