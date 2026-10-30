import { RemoteFailure } from './api-contract.ts';
import { remoteGet } from './remote.ts';
/** Scopes accepted by Wbengine\Api\V2\Model::SCOPES (framework v4.0.x). Analytics is not issuable yet. */
export const frameworkScopes = ['discovery:read', 'articles:read', 'articles:write', 'pages:read', 'pages:write', 'menu:read', 'menu:write', 'sections:read', 'sections:write', 'boxes:read', 'boxes:write', 'translations:read', 'translations:write', 'images:read', 'images:write', 'preview:read', 'publish:write'] as const;
export const analyticsScope = 'analytics:read';
/** Reading the change log. Part of the key profile of newer sites, so older keys without it stay registrable. */
export const auditScope = 'audit:read';
/** Single source of truth for the key purpose. canOperate() in content.ts must never require a scope outside it. */
export const scopeProfiles = {
    management: {
        label: 'Site management in WBengine Admin',
        scopes: [...frameworkScopes] as string[],
        optional: [analyticsScope, auditScope] as string[]
    }
} as const;
export type ScopeProfile = keyof typeof scopeProfiles;
export const registrationErrors = {
    invalid_input: 'Enter the site name (at most 160 characters) and a valid integration key starting with wbv2_.',
    invalid_url: 'The site address is not allowed. Use an HTTPS address without credentials, parameters and fragment, port 443.',
    unsafe_target: 'The site address points to a disallowed network. The site must be reachable at a public HTTPS address. If it runs on the same server as Admin, check that DNS in the Admin container returns a public IP address, not 127.x or a private one (see the guide, Troubleshooting).',
    unreachable: 'The site could not be contacted. Check the address, DNS and a valid HTTPS certificate.',
    timeout: 'The site did not respond within the time limit. Try again later.',
    api_unavailable: 'API v2 is not available on the site. Enable API v2 and install the framework SQL migrations.',
    invalid_key: 'The integration key is not valid or has been revoked. Issue a new key on the site.',
    forbidden: 'The site rejected the request. Check that the key has the required permission and the site accepts HTTPS.',
    missing_scope: 'The key does not have all permissions of the Site management profile. Issue a new key with the full profile.',
    rate_limited: 'The site has temporarily limited failed attempts. Try again in a few minutes.',
    bad_contract: 'The site returned an unexpected response. Check that WBengine with API v2 is running.',
    duplicate_url: 'This site is already registered.',
    same_key: 'The entered key is the same as the one already stored. Issue a new key on the site.',
    remote_error: 'The site did not process the request. Try again later.'
} as const;
export type RegistrationErrorCode = keyof typeof registrationErrors;
/** Carries only a catalog code, never the key, the raw exception or network details. */
export class RegistrationError extends Error {
    code: RegistrationErrorCode;
    missing: string[];
    constructor(code: RegistrationErrorCode, missing: string[] = []) {
        super(registrationErrors[code]);
        this.code = code;
        this.missing = missing;
    }
}
export function classifyRegistrationError(e: unknown): RegistrationErrorCode {
    if (e instanceof RegistrationError)
        return e.code;
    if (e instanceof RemoteFailure) {
        if (e.status === 401)
            return 'invalid_key';
        if (e.status === 403)
            return 'forbidden';
        if (e.status === 404 || e.status === 503)
            return 'api_unavailable';
        if (e.status === 429)
            return 'rate_limited';
        return 'remote_error';
    }
    const message = e instanceof Error ? e.message : '';
    if (e instanceof TypeError || message === 'Disallowed site address' || message === 'Only HTTPS port 443 is allowed')
        return 'invalid_url';
    if (message === 'DNS address is not allowed')
        return 'unsafe_target';
    if (message === 'API timed out')
        return 'timeout';
    if (message === 'API connection failed')
        return 'unreachable';
    if (message === 'Invalid API response' || message === 'Invalid discovery contract')
        return 'bad_contract';
    return 'remote_error';
}
export function registrationMessage(e: unknown) {
    const code = classifyRegistrationError(e);
    return { code, message: registrationErrors[code] };
}
export function projectCapabilities(raw: unknown) {
    const body = raw as {
        success?: boolean;
        data?: {
            api_version?: unknown;
            capabilities?: Record<string, {
                read?: unknown;
                write?: unknown;
            }>;
        };
    };
    if (body?.success !== true || body.data?.api_version !== '2.0' || !body.data.capabilities)
        throw Error('Invalid discovery contract');
    const names = ['discovery', 'articles', 'pages', 'menu', 'sections', 'boxes', 'translations', 'images', 'templates', 'preview', 'publish'];
    return { version: '2.0', resources: names.map(name => ({ name, read: body.data!.capabilities![name]?.read === true, write: body.data!.capabilities![name]?.write === true })) };
}
export interface VerifiedSite {
    integrationId: number;
    scopes: string[];
    version: string;
    resources: {
        name: string;
        read: boolean;
        write: boolean;
    }[];
    /** Optional extras the key carries beyond the profile (for example analytics). */
    extras: string[];
}
type Getter = (base: string, resource: 'capabilities' | 'identity', key: string, allowlist: string[]) => Promise<unknown>;
/**
 * Shared pre-save check for the web form and the CLI. Performs no database write.
 * Throws RegistrationError with a catalog code; all other failures are mapped by classifyRegistrationError.
 */
export async function verifyRegistration(base: string, key: string, allowlist: string[] = [], profile: ScopeProfile = 'management', get: Getter = remoteGet): Promise<VerifiedSite> {
    let capabilities: ReturnType<typeof projectCapabilities>, identity: {
        success?: boolean;
        data?: {
            integration_id?: unknown;
            scopes?: unknown;
        };
    };
    try {
        capabilities = projectCapabilities(await get(base, 'capabilities', key, allowlist));
        identity = await get(base, 'identity', key, allowlist) as typeof identity;
    }
    catch (e) {
        throw new RegistrationError(classifyRegistrationError(e));
    }
    const id = identity?.data?.integration_id, scopes = identity?.data?.scopes;
    if (identity?.success !== true || typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || !Array.isArray(scopes) || !scopes.every(s => typeof s === 'string'))
        throw new RegistrationError('bad_contract');
    const granted = scopes as string[], wanted = scopeProfiles[profile];
    if (!granted.includes('discovery:read'))
        throw new RegistrationError('missing_scope', ['discovery:read']);
    const missing = wanted.scopes.filter(s => !granted.includes(s));
    if (missing.length)
        throw new RegistrationError('missing_scope', missing);
    const unknown = granted.filter(s => !wanted.scopes.includes(s) && !wanted.optional.includes(s));
    if (unknown.length)
        throw new RegistrationError('bad_contract');
    return { integrationId: id, scopes: granted, version: capabilities.version, resources: capabilities.resources, extras: granted.filter(s => wanted.optional.includes(s)) };
}
