import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createApiClient, RemoteFailure } from '../src/lib/server/remote.ts';
import type { ApiCall } from '../src/lib/server/api-contract.ts';

test('analytics transport uses only GET overview query and keeps key out of browser response', async () => {
    const key = 'wbv2_analytics_transport_secret', seen: { method?: string; path?: string; auth?: string }[] = [];
    const server = createServer((req, res) => {
        seen.push({ method: req.method, path: req.url, auth: req.headers.authorization });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: { marker: 'analytics' } }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as import('node:net').AddressInfo).port;
    const call = createApiClient({ resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport: (options, cb) => request({ hostname: '127.0.0.1', port, path: options.path, method: options.method, headers: options.headers }, cb) });
    try {
        const operation: ApiCall = { operation: 'analyticsOverview', from: '2026-10-25', to: '2026-10-26', granularity: 'day' };
        const result = await call('https://example.com', operation, key, [], undefined, 'admin:12');
        assert.deepEqual(result.data, { marker: 'analytics' });
        assert.ok(!JSON.stringify(result).includes(key));
        assert.deepEqual(seen, [{ method: 'GET', path: '/api/v2/analytics/overview?from=2026-10-25&to=2026-10-26&granularity=day', auth: `Bearer ${key}` }]);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('analytics transport sanitizes unsupported scope and unavailable response statuses', async () => {
    const server = createServer((_req, res) => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { code: 'forbidden', message: 'Private details' } }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as import('node:net').AddressInfo).port;
    const call = createApiClient({ resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport: (options, cb) => request({ hostname: '127.0.0.1', port, path: options.path, method: options.method }, cb) });
    try {
        await assert.rejects(call('https://example.com', { operation: 'analyticsOverview', from: '2026-10-25', to: '2026-10-26', granularity: 'day' }, 'wbv2_private_key'), error => error instanceof RemoteFailure && error.status === 403 && !error.message.includes('Private details'));
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
