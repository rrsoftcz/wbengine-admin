import { planApiCall, RemoteFailure, safeErrorCode, strongEtag, type ApiCall, type ApiReply } from './api-contract.ts';
export { planApiCall, RemoteFailure } from './api-contract.ts';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
function ipv6Bytes(ip: string): number[] | null {
    let s = ip.toLowerCase();
    if (s.includes('.')) {
        const i = s.lastIndexOf(':');
        const v = s.slice(i + 1).split('.').map(Number);
        s = s.slice(0, i) + ':' + ((v[0] << 8) | v[1]).toString(16) + ':' + ((v[2] << 8) | v[3]).toString(16);
    }
    const halves = s.split('::');
    const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
    const parts = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return parts.length === 8 ? parts.flatMap(p => [parseInt(p, 16) >> 8, parseInt(p, 16) & 255]) : null;
}
export function isPublicAddress(ip: string): boolean {
    if (isIP(ip) === 4) {
        const [a, b, c] = ip.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2 || b === 88 && c === 99) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
    }
    if (isIP(ip) !== 6)
        return false;
    const b = ipv6Bytes(ip)!;
    if (b.slice(0, 10).every(x => x === 0) && b[10] === 255 && b[11] === 255)
        return isPublicAddress(b.slice(12).join('.'));
    return b[0] >= 0x20 && b[0] <= 0x3f && !(b[0] === 0x20 && b[1] === 1 && (b[2] === 0x0d && b[3] === 0xb8 || b[2] <= 1)) && !(b[0] === 0x20 && b[1] === 2) && !(b[0] === 0x3f && b[1] === 0xff);
}
export function validateBaseUrl(raw: string, allowed: string[] = []) {
    const u = new URL(raw);
    const hostname = u.hostname.replace(/^\[|\]$/g, '');
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || raw.includes('?') || raw.includes('#') || u.pathname.split('/').some(x => decodeURIComponent(x) === '..') || isIP(hostname) && !isPublicAddress(hostname) && !allowed.includes(hostname))
        throw Error('Disallowed site address');
    if (u.port && u.port !== '443')
        throw Error('Only HTTPS port 443 is allowed');
    u.pathname = u.pathname.replace(/\/?$/, '/');
    return u;
}
type Resolver = (host: string) => Promise<{
    address: string;
    family: number;
}[]>;
export async function resolveTarget(raw: string, allowed: string[] = [], resolver: Resolver = host => dnsLookup(host, { all: true, verbatim: true })) {
    const url = validateBaseUrl(raw, allowed), hostname = url.hostname.replace(/^\[|\]$/g, '');
    const answers = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolver(hostname);
    if (!answers.length || answers.some(a => !isPublicAddress(a.address) && !allowed.includes(a.address)))
        throw Error('DNS address is not allowed');
    return { url, hostname, ...answers[0] };
}
export type RemoteResource = 'capabilities' | 'identity';
export interface RemoteClientOptions {
    deadlineMs?: number;
    resolver?: Resolver;
    transport?: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
}
export function createApiClient({ deadlineMs = 8000, resolver, transport = request }: RemoteClientOptions = {}) {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > 8000)
        throw Error('Invalid API time limit');
    return function apiCall(base: string, call: ApiCall, key: string, allowlist: string[] = [], signal?: AbortSignal, actor?: string): Promise<ApiReply> {
        const plan = planApiCall(call);
        if (actor && !/^admin:[1-9][0-9]*$/.test(actor))
            return Promise.reject(Error('Invalid actor'));
        const body = plan.data ? JSON.stringify(plan.data) : undefined;
        if (body && Buffer.byteLength(body) > 1048576)
            return Promise.reject(Error('Request too large'));
        return new Promise((resolve, reject) => {
            let settled = false, req: ClientRequest | undefined, res: IncomingMessage | undefined;
            const cleanup = () => {
                clearTimeout(deadline);
                signal?.removeEventListener('abort', onAbort);
            };
            const fail = (error: Error) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                res?.destroy();
                req?.destroy();
                reject(error);
            };
            const onAbort = () => fail(Error('API request was aborted'));
            const deadline = setTimeout(() => fail(Error('API timed out')), deadlineMs);
            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            void resolveTarget(base, allowlist, resolver).then(t => {
                if (settled)
                    return;
                req = transport({ protocol: 'https:', hostname: t.hostname, port: 443, path: t.url.pathname + `api/v2/${plan.path}`, method: plan.method, servername: isIP(t.hostname) ? undefined : t.hostname, rejectUnauthorized: true, agent: false, lookup: pinnedLookup(t) as never, headers: { Accept: 'application/json', ...(call.operation !== 'capabilities' ? { Authorization: `Bearer ${key}` } : {}), ...(plan.etag ? { 'If-Match': plan.etag } : {}), ...(actor ? { 'X-WBengine-Actor': actor } : {}), ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) }, timeout: deadlineMs }, response => {
                    res = response;
                    res.on('error', () => fail(Error('API response was interrupted')));
                    res.on('aborted', () => fail(Error('API response was interrupted')));
                    if (settled) {
                        res.destroy();
                        return;
                    }
                    if (res.statusCode !== 200 && res.statusCode !== 201) {
                        // From an error response only a code from the closed catalog is kept. The message text and details are never read further.
                        const status = res.statusCode ?? 503, errorChunks: Buffer[] = [];
                        let errorSize = 0, finished = false;
                        const finish = () => {
                            if (finished)
                                return;
                            finished = true;
                            clearTimeout(errorTimer);
                            let code = 'remote_rejected';
                            try {
                                const raw = Buffer.concat(errorChunks).toString();
                                if (!(key && raw.includes(key)))
                                    code = safeErrorCode(JSON.parse(raw)?.error?.code);
                            }
                            catch { /* invalid body: generic message */ }
                            fail(new RemoteFailure(status, code));
                        };
                        const errorTimer = setTimeout(finish, 200);
                        res.on('data', (chunk: Buffer) => {
                            errorSize += chunk.length;
                            if (errorSize > 4096) {
                                errorChunks.length = 0;
                                finish();
                                return;
                            }
                            errorChunks.push(chunk);
                        });
                        res.on('end', finish);
                        return;
                    }
                    let size = 0;
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => {
                        if (settled)
                            return;
                        size += chunk.length;
                        if (size > 1024 * 1024) {
                            fail(Error('API response is too large'));
                            return;
                        }
                        chunks.push(chunk);
                    });
                    res.on('end', () => {
                        if (settled)
                            return;
                        try {
                            const raw = Buffer.concat(chunks).toString();
                            if (key && raw.includes(key))
                                throw Error();
                            const data = JSON.parse(raw);
                            if (key && JSON.stringify(data).includes(key))
                                throw Error();
                            if (data?.success !== true || !('data' in data))
                                throw Error();
                            settled = true;
                            cleanup();
                            resolve({ data: data.data, etag: strongEtag(res?.headers.etag) ? res.headers.etag : null, ...(data.pagination ? { pagination: data.pagination } : {}) });
                        }
                        catch {
                            fail(Error('Invalid API response'));
                        }
                    });
                });
                req.on('timeout', () => fail(Error('API timed out')));
                req.on('error', () => fail(Error('API connection failed')));
                if (settled) {
                    req.destroy();
                    return;
                }
                req.end(body);
            }).catch(() => fail(Error('API connection failed')));
        });
    };
}
export function createRemoteClient(options: RemoteClientOptions = {}) {
    const call = createApiClient(options);
    return async (base: string, resource: RemoteResource, key: string, allowlist: string[] = [], signal?: AbortSignal) => {
        if (resource !== 'capabilities' && resource !== 'identity')
            throw Error('Disallowed API resource');
        const result = await call(base, { operation: resource }, key, allowlist, signal);
        return { success: true, data: result.data };
    };
}
export const remoteGet = createRemoteClient();
export const apiCall = createApiClient();
export function pinnedLookup(target: {
    address: string;
    family: number;
}) {
    return (_host: string, options: {
        all?: boolean;
    }, cb: Function) => {
        if (options?.all)
            cb(null, [{ address: target.address, family: target.family }]);
        else
            cb(null, target.address, target.family);
    };
}
