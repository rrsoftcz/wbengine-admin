import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import * as remote from '../src/lib/server/remote.ts';
import type { RemoteClientOptions } from '../src/lib/server/remote.ts';
async function fixture(run: (make: (options: RemoteClientOptions & {
    signal?: AbortSignal;
}) => ReturnType<typeof remote.remoteGet>, counts: {
    connections: number;
    closed: number;
}) => Promise<void>) {
    const counts = { connections: 0, closed: 0 };
    const server = createServer((req, res) => {
        counts.connections++;
        res.on('close', () => {
            counts.closed++;
            clearInterval(interval);
        });
        if (req.url?.includes('identity')) {
            res.writeHead(403);
        }
        else
            res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"slow":"');
        const interval = setInterval(() => res.write('a'), 10);
        const guard = setTimeout(() => {
            clearInterval(interval);
            res.end('"}');
        }, 300);
        res.on('close', () => clearTimeout(guard));
        interval.unref();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as import('node:net').AddressInfo;
    const transport = (options: import('node:https').RequestOptions, callback: (response: import('node:http').IncomingMessage) => void) => httpRequest({ hostname: '127.0.0.1', port: address.port, path: options.path, headers: options.headers }, callback);
    try {
        await run(options => {
            const { signal, ...settings } = options;
            return remote.createRemoteClient({ deadlineMs: 70, resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport, ...settings })('https://example.com', 'capabilities', '', [], signal);
        }, counts);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
    }
}
test('total deadline includes delayed DNS and prevents a late connection', async () => {
    await fixture(async (make, counts) => {
        const started = performance.now();
        await assert.rejects(make({ deadlineMs: 30, resolver: async () => {
                await new Promise(r => setTimeout(r, 180));
                return [{ address: '8.8.8.8', family: 4 }];
            } }), /čas API/);
        assert.ok(performance.now() - started < 150);
        await new Promise(r => setTimeout(r, 200));
        assert.equal(counts.connections, 0);
    });
});
test('streaming body cannot extend the total deadline and socket is destroyed', async () => {
    await fixture(async (make, counts) => {
        const started = performance.now();
        await assert.rejects(make({}), /čas API/);
        assert.ok(performance.now() - started < 250);
        await new Promise(r => setTimeout(r, 30));
        assert.equal(counts.connections, 1);
        assert.equal(counts.closed, 1);
    });
});
test('non-200 streaming response is destroyed immediately instead of drained', async () => {
    const server = createServer((_req, res) => {
        res.writeHead(403);
        res.write('denied');
        const interval = setInterval(() => res.write('a'), 10);
        res.on('close', () => clearInterval(interval));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let closed = false;
    server.on('connection', s => s.on('close', () => closed = true));
    const address = server.address() as import('node:net').AddressInfo;
    try {
        const get = remote.createRemoteClient({ deadlineMs: 500, transport: (options: import('node:https').RequestOptions, cb: (r: import('node:http').IncomingMessage) => void) => httpRequest({ hostname: '127.0.0.1', port: address.port, path: options.path }, cb), resolver: async () => [{ address: '8.8.8.8', family: 4 }] });
        await assert.rejects(get('https://example.com', 'identity', '', []), e=>e instanceof remote.RemoteFailure&&e.status===403);
        await new Promise(r => setTimeout(r, 40));
        assert.equal(closed, true);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
    }
});
test('caller abort destroys an active response and request', async () => {
    await fixture(async (make, counts) => {
        const controller = new AbortController();
        const pending = make({ deadlineMs: 500, signal: controller.signal });
        await new Promise(r => setTimeout(r, 30));
        assert.equal(counts.connections, 1);
        controller.abort();
        await assert.rejects(pending, /zrušen/);
        await new Promise(r => setTimeout(r, 30));
        assert.equal(counts.closed, 1);
    });
});
test('deadline also bounds a real stalled TLS handshake', async () => {
    const { createServer } = await import('node:net'), { request } = await import('node:https');
    let closed = false;
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer(socket => {
        sockets.add(socket);
        socket.resume();
        socket.on('close', () => {
            closed = true;
            sockets.delete(socket);
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as import('node:net').AddressInfo).port;
    try {
        const get = remote.createRemoteClient({ deadlineMs: 70, resolver: async () => [{ address: '8.8.8.8', family: 4 }], transport: (options, callback) => request({ ...options, hostname: '127.0.0.1', port, lookup: undefined, servername: 'example.com' }, callback) });
        await assert.rejects(get('https://example.com', 'capabilities', ''), /čas API/);
        await new Promise(r => setTimeout(r, 30));
        assert.equal(closed, true);
    }
    finally {
        for (const socket of sockets)
            socket.destroy();
        await new Promise<void>(r => server.close(() => r()));
    }
});
