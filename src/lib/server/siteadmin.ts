import { RemoteFailure, type ApiCall, type ApiReply } from './api-contract.ts';
import type { Capabilities, Role } from './content.ts';

export const userRoles = ['user', 'editor', 'admin'] as const;
export type UserRole = (typeof userRoles)[number];
export const usersPerPage = 25;

export interface SiteUser { id: number; email: string; username: string; firstname: string | null; lastname: string | null; role: UserRole; disabled: boolean }
export interface PasswordLink { token: string; expires_at: number }
export interface UserPage { items: SiteUser[]; page: number; perPage: number; total: number; totalPages: number }
export interface UsersQuery { page: number; search: string | null; role: UserRole | null }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const maybeText = (value: unknown, max: number) => value === null || value === undefined || text(value, max);

export function parseUsersQuery(params: URLSearchParams): UsersQuery {
    const search = (params.get('q') ?? '').trim().slice(0, 100), role = params.get('role'), page = Number(params.get('page'));
    return {
        page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000000) : 1,
        search: search && !/[\u0000-\u001f\u007f]/.test(search) ? search : null,
        role: (userRoles as readonly string[]).includes(role ?? '') ? role as UserRole : null
    };
}

/** Projects one remote user; nothing but the known public fields is kept. */
export function projectUser(value: unknown): SiteUser {
    if (!isObject(value) || !count(value.id) || value.id < 1 || !text(value.email, 100) || !text(value.username, 150) || !maybeText(value.firstname, 45) || !maybeText(value.lastname, 150)
        || !(userRoles as readonly string[]).includes(value.role as string) || typeof value.disabled !== 'boolean')
        throw Error('Invalid user entry');
    return { id: value.id, email: value.email, username: value.username, firstname: (value.firstname as string | null | undefined) ?? null, lastname: (value.lastname as string | null | undefined) ?? null, role: value.role as UserRole, disabled: value.disabled };
}

export function projectLink(value: unknown): PasswordLink {
    if (!isObject(value) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) || !count(value.expires_at))
        throw Error('Invalid password link');
    return { token: value.token, expires_at: value.expires_at };
}

export function validateUserPage(reply: ApiReply): UserPage {
    const p = reply.pagination;
    if (!Array.isArray(reply.data) || reply.data.length > 100 || !isObject(p) || !count(p.page) || !count(p.per_page) || !count(p.total) || !count(p.total_pages))
        throw Error('Invalid users response');
    return { items: reply.data.map(projectUser), page: p.page, perPage: p.per_page, total: p.total, totalPages: Math.max(1, p.total_pages) };
}

/** Settings as the site reports them: a tree of scalars, `set` for secrets. Bounded in depth and size. */
export interface ConfigNode { [key: string]: ConfigValue }
export type ConfigValue = string | number | boolean | null | ConfigValue[] | ConfigNode;
export function projectConfig(value: unknown, depth = 0): ConfigValue {
    if (depth > 8) throw Error('Invalid settings response');
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.length <= 500 ? value : value.slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 200).map(v => projectConfig(v, depth + 1));
    if (isObject(value)) {
        const out: ConfigNode = {};
        for (const [k, v] of Object.entries(value).slice(0, 200)) out[k.slice(0, 100)] = projectConfig(v, depth + 1);
        return out;
    }
    throw Error('Invalid settings response');
}

const manager = (role: Role) => role === 'siteadmin' || role === 'global';

export function canManageUsers(role: Role, scopes: string[], capabilities: Capabilities): { read: boolean; write: boolean } {
    const read = manager(role) && scopes.includes('users:read') && capabilities.users?.read === true;
    return { read, write: read && scopes.includes('users:write') && capabilities.users?.write === true };
}
export const canFlushCache = (role: Role, scopes: string[], capabilities: Capabilities) => manager(role) && scopes.includes('cache:write') && capabilities.cache?.write === true;
export const canReadConfig = (role: Role, scopes: string[], capabilities: Capabilities) => manager(role) && scopes.includes('config:read') && capabilities.config?.read === true;

interface Options { role: Role; scopes: string[]; capabilities: Capabilities; call: (call: ApiCall) => Promise<ApiReply> }
export function createSiteAdminGateway(o: Options) {
    const users = () => canManageUsers(o.role, o.scopes, o.capabilities);
    const need = (ok: boolean) => { if (!ok) throw new RemoteFailure(403, 'forbidden'); };
    return {
        users,
        canFlushCache: () => canFlushCache(o.role, o.scopes, o.capabilities),
        canReadConfig: () => canReadConfig(o.role, o.scopes, o.capabilities),
        /** The site offers the feature to a manager, but the key was issued before the scope existed. */
        needsNewKey: () => manager(o.role) && (['users', 'cache', 'config'] as const).some(k => (o.capabilities[k]?.read === true || o.capabilities[k]?.write === true)) && !o.scopes.includes('users:read'),
        async list(q: UsersQuery): Promise<UserPage> {
            need(users().read);
            return validateUserPage(await o.call({ operation: 'usersList', page: q.page, perPage: usersPerPage, users: { ...(q.search ? { search: q.search } : {}), ...(q.role ? { role: q.role } : {}) } }));
        },
        async create(data: { email: string; role: UserRole; firstname?: string; lastname?: string }): Promise<{ user: SiteUser; link: PasswordLink }> {
            need(users().write);
            const reply = await o.call({ operation: 'userCreate', data });
            if (!isObject(reply.data)) throw Error('Invalid create response');
            return { user: projectUser(reply.data), link: projectLink(reply.data.password_setup) };
        },
        async update(id: number, data: { role?: UserRole; disabled?: boolean }): Promise<SiteUser> {
            need(users().write);
            return projectUser((await o.call({ operation: 'userUpdate', id: String(id), data })).data);
        },
        async resetLink(id: number): Promise<PasswordLink> {
            need(users().write);
            const reply = await o.call({ operation: 'userReset', id: String(id) });
            return projectLink(isObject(reply.data) ? reply.data.password_setup : null);
        },
        async flushCache(): Promise<void> {
            need(canFlushCache(o.role, o.scopes, o.capabilities));
            await o.call({ operation: 'cacheFlush' });
        },
        async config(): Promise<ConfigNode> {
            need(canReadConfig(o.role, o.scopes, o.capabilities));
            const reply = await o.call({ operation: 'siteConfig' });
            const settings = isObject(reply.data) ? projectConfig(reply.data.settings) : null;
            if (!isObject(settings)) throw Error('Invalid settings response');
            return settings as ConfigNode;
        }
    };
}
