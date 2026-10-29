import { randomBytes, createCipheriv, createDecipheriv, createHash, createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('base64url');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export class SecretVault {
    private key: Buffer;
    constructor(key: Buffer) {
        if (key.length !== 32)
            throw Error('Invalid master key');
        this.key = key;
    }
    encrypt(value: string, context: string) {
        const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', this.key, iv);
        c.setAAD(Buffer.from(context));
        const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
        return [iv, c.getAuthTag(), data].map(x => x.toString('base64url')).join('.');
    }
    decrypt(value: string, context: string) {
        const parts = value.split('.');
        if (parts.length !== 3)
            throw Error('Invalid cipher');
        const [iv, tag, data] = parts.map(x => Buffer.from(x, 'base64url'));
        const d = createDecipheriv('aes-256-gcm', this.key, iv);
        d.setAAD(Buffer.from(context));
        d.setAuthTag(tag);
        return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    }
}
export async function hashPassword(password: string) {
    if (password.length < 14 || password.length > 256)
        throw Error('Password must be 14 to 256 characters');
    const salt = randomBytes(16).toString('hex');
    const hash = await derive(password, salt, 64) as Buffer;
    return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
    const [kind, salt, hash] = stored.split(':');
    if (kind !== 'scrypt' || !salt || !hash || password.length > 256)
        return false;
    const expected = Buffer.from(hash, 'hex'), actual = await derive(password, salt, 64) as Buffer;
    return expected.length === actual.length && timingSafeEqual(actual, expected);
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
    let bits = '', result = '';
    for (const b of randomBytes(20))
        bits += b.toString(2).padStart(8, '0');
    for (let i = 0; i < bits.length; i += 5)
        result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
    return result;
}
function decodeBase32(secret: string) {
    let bits = '';
    for (const c of secret) {
        const n = alphabet.indexOf(c);
        if (n < 0)
            throw Error('Invalid MFA key');
        bits += n.toString(2).padStart(5, '0');
    }
    return Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
}
export function totp(secret: string, counter: number) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(counter));
    const h = createHmac('sha1', decodeBase32(secret)).update(b).digest(), offset = h[19] & 15;
    return ((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, now = Date.now(), last = -1) {
    if (!/^\d{6}$/.test(code))
        return null;
    const current = Math.floor(now / 30000);
    for (const n of [current - 1, current, current + 1])
        if (n >= 0 && n > last && timingSafeEqual(Buffer.from(totp(secret, n)), Buffer.from(code)))
            return n;
    return null;
}
export function permitted(globalAdmin: boolean, role: string | null, required: 'read' | 'manage') {
    return globalAdmin || role === 'siteadmin' || (required === 'read' && role === 'editor');
}
