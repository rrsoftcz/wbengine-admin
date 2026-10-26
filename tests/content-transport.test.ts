import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createApiClient, RemoteFailure } from '../src/lib/server/remote.ts';
import type { ApiCall } from '../src/lib/server/api-contract.ts';
test('HTTP transport forwards finite methods, request JSON, actor and exact ETags without exposing bearer keys', async () => {
    const key = 'wbv2_transport_fixture_key_only', etag = '"' + 'a'.repeat(64) + '"', seen: {
        method: string;
        path: string;
        etag: string | undefined;
        body: unknown;
        actor: unknown;
        auth: unknown;
    }[] = [];
    const server = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req)
            body += chunk;
        seen.push({ method: req.method!, path: req.url!, etag: req.headers['if-match'] as string | undefined, body: body ? JSON.parse(body) : null, actor: req.headers['x-wbengine-actor'], auth: req.headers.authorization });
        res.writeHead(req.method === 'POST' && req.url === '/api/v2/articles' ? 201 : 200, { 'Content-Type': 'application/json', ETag: etag });
        res.end(JSON.stringify({ success: true, data: { id: 7, title: 'Saved' } }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as import('node:net').AddressInfo).port;
    const call = createApiClient({ resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport: (options, cb) => request({ hostname: '127.0.0.1', port, path: options.path, method: options.method, headers: options.headers }, cb) });
    try {
        const cases: ApiCall[] = [{ operation: 'create', resource: 'articles', data: { title: 'Draft', introtext: 'Intro', bodytext: 'Body', content_format: 'markdown' } }, { operation: 'update', resource: 'articles', id: '7', etag, data: { title: 'Changed' } }, { operation: 'publish', resource: 'articles', id: '7', etag, data: {} }, { operation: 'translationSave', resource: 'articles', id: '7', locale: 'en_GB', etag, data: { title: 'English' } }, { operation: 'structureRestore', resource: 'pages', id: '3', etag, data: { change_id: 12 } }, { operation: 'delete', resource: 'images', id: 'f'.repeat(32), etag }];
        for (const value of cases) {
            const result = await call('https://example.com', value, key, [], undefined, 'admin:12');
            assert.equal(result.etag, etag);
            assert.ok(!JSON.stringify(result).includes(key));
        }
        assert.deepEqual(seen.map(x => [x.method, x.path]), [['POST', '/api/v2/articles'], ['PATCH', '/api/v2/articles/7'], ['POST', '/api/v2/articles/7/publish'], ['PUT', '/api/v2/translations/article/7/en_GB'], ['POST', '/api/v2/pages/3/restore'], ['DELETE', '/api/v2/images/' + 'f'.repeat(32)]]);
        assert.deepEqual(seen[2].body, {});
        assert.equal(seen[1].etag, etag);
        assert.equal(seen[0].actor, 'admin:12');
        assert.equal(seen[0].auth, 'Bearer ' + key);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
    }
});
test('API cannot echo an integration key with JSON Unicode escapes into browser data', async () => {
    const key = 'wbv2_echo_fixture_secret';
    const server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success":true,"data":{"title":"' + key.replace('w', '\\u0077') + '"}}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as import('node:net').AddressInfo).port;
    const call = createApiClient({ resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport: (options, cb) => request({ hostname: '127.0.0.1', port, path: options.path }, cb) });
    try {
        await assert.rejects(call('https://example.com', { operation: 'get', resource: 'articles', id: '1' }, key), e => e instanceof Error && !e.message.includes(key));
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
    }
});
