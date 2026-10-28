import { RemoteFailure } from './api-contract.ts';
import { remoteGet } from './remote.ts';
/** Scopes accepted by Wbengine\Api\V2\Model::SCOPES (framework v4.0.x). Analytics is not issuable yet. */
export const frameworkScopes = ['discovery:read', 'articles:read', 'articles:write', 'pages:read', 'pages:write', 'menu:read', 'menu:write', 'sections:read', 'sections:write', 'boxes:read', 'boxes:write', 'translations:read', 'translations:write', 'images:read', 'images:write', 'preview:read', 'publish:write'] as const;
export const analyticsScope = 'analytics:read';
/** Single source of truth for the key purpose. canOperate() in content.ts must never require a scope outside it. */
export const scopeProfiles = {
    management: {
        label: 'Správa webu v WBengine Adminu',
        scopes: [...frameworkScopes] as string[],
        optional: [analyticsScope] as string[]
    }
} as const;
export type ScopeProfile = keyof typeof scopeProfiles;
export const registrationErrors = {
    invalid_input: 'Vyplňte název webu (nejvýše 160 znaků) a platný integrační klíč začínající wbv2_.',
    invalid_url: 'Adresa webu není povolená. Použijte HTTPS adresu bez přihlašovacích údajů, parametrů a fragmentu, port 443.',
    unsafe_target: 'Adresa webu míří do nepovolené sítě. Web musí být dostupný na veřejné HTTPS adrese. Pokud běží na stejném serveru jako Admin, zkontrolujte, že DNS v kontejneru Adminu vrací veřejnou IP adresu, ne 127.x nebo privátní (viz průvodce, Odstraňování potíží).',
    unreachable: 'Web se nepodařilo kontaktovat. Ověřte adresu, DNS a platný HTTPS certifikát.',
    timeout: 'Web neodpověděl v časovém limitu. Zkuste to znovu později.',
    api_unavailable: 'API v2 na webu není dostupné. Zapněte API v2 a nainstalujte SQL migrace frameworku.',
    invalid_key: 'Integrační klíč není platný nebo byl odvolán. Vydejte nový klíč na webu.',
    forbidden: 'Web požadavek odmítl. Ověřte, že klíč má potřebné oprávnění a web přijímá HTTPS.',
    missing_scope: 'Klíč nemá všechna oprávnění profilu Správa webu. Vydejte nový klíč s úplným profilem.',
    rate_limited: 'Web dočasně omezil počet neúspěšných pokusů. Zkuste to znovu za několik minut.',
    bad_contract: 'Web vrátil neočekávanou odpověď. Ověřte, že běží WBengine s API v2.',
    duplicate_url: 'Tento web už je zaregistrovaný.',
    same_key: 'Zadaný klíč je stejný jako dosud uložený. Vydejte na webu nový klíč.',
    remote_error: 'Web požadavek nezpracoval. Zkuste to znovu později.'
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
    if (e instanceof TypeError || message === 'Nepovolená adresa webu' || message === 'Povolen je pouze HTTPS port 443')
        return 'invalid_url';
    if (message === 'DNS adresa není povolena')
        return 'unsafe_target';
    if (message === 'Vypršel čas API')
        return 'timeout';
    if (message === 'Spojení s API selhalo')
        return 'unreachable';
    if (message === 'Neplatná odpověď API' || message === 'Neplatný discovery kontrakt')
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
        throw Error('Neplatný discovery kontrakt');
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
