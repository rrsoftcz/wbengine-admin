/**
 * One-off import of the old MySQL database into the SQLite file (docs/plan-sqlite-migration.md).
 * Reads LEGACY_DATABASE_URL, writes DATABASE_PATH, refuses a target that already holds accounts or sites.
 * Row ids are kept (the ciphertext is bound to them). Sessions, login counters and recovery tokens are not copied.
 * Everything runs in one transaction: any mismatch rolls back and leaves the SQLite file empty.
 * Removed again in the cleanup release together with the mysql2 dependency.
 */
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { transaction, rows, closeDatabase, type Argument } from '../src/lib/server/db.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { vault } from '../src/lib/server/auth.ts';
const tables: Record<string, string[]> = {
    users: ['id', 'email', 'password_hash', 'global_admin', 'mfa_secret', 'mfa_enabled', 'mfa_counter', 'disabled', 'created_at', 'locale', 'password_changed_at'],
    sites: ['id', 'name', 'base_url', 'key_cipher', 'created_at', 'url_hash', 'integration_id'],
    grants: ['user_id', 'site_id', 'role'],
    backup_codes: ['user_id', 'code_hash'],
    invitations: ['token_hash', 'email', 'global_admin', 'site_id', 'role', 'expires_at', 'used_at'],
    audit: ['id', 'user_id', 'site_id', 'event', 'created_at']
};
const url = process.env.LEGACY_DATABASE_URL;
if (!url)
    throw Error('Set LEGACY_DATABASE_URL to the old MySQL connection URL');
const source = await mysql.createConnection({ uri: url, dateStrings: true, timezone: 'Z' });
try {
    const counts: Record<string, [number, number]> = {};
    await transaction(async (c) => {
        await migrate(c);
        for (const t of ['users', 'sites', 'audit'])
            if (Number((await rows<{ n: number }>(c, `SELECT COUNT(*) AS n FROM ${t}`))[0].n) > 0)
                throw Error(`The target is not empty (${t}); the import runs only into a fresh database`);
        for (const [table, columns] of Object.entries(tables)) {
            const [data] = await source.query(`SELECT ${columns.join(',')} FROM ${table} ORDER BY 1`) as unknown as [Record<string, Argument>[]];
            const insert = `INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
            for (const row of data) {
                if (table === 'sites' && row.url_hash === null)
                    row.url_hash = createHash('sha256').update(String(row.base_url)).digest('hex');
                await c.execute(insert, columns.map(k => row[k] === undefined ? null : row[k]));
            }
            counts[table] = [data.length, Number((await rows<{ n: number }>(c, `SELECT COUNT(*) AS n FROM ${table}`))[0].n)];
        }
        const v = vault();
        for (const s of await rows<{ id: number; key_cipher: string }>(c, 'SELECT id,key_cipher FROM sites'))
            v.decrypt(s.key_cipher, `site:${s.id}`);
        for (const u of await rows<{ id: number; mfa_secret: string }>(c, 'SELECT id,mfa_secret FROM users WHERE mfa_secret IS NOT NULL'))
            v.decrypt(u.mfa_secret, `mfa:${u.id}`);
        for (const [table, [from, to]] of Object.entries(counts))
            if (from !== to)
                throw Error(`Row count mismatch in ${table}: ${from} source, ${to} target`);
    });
    for (const [table, [from, to]] of Object.entries(counts))
        console.log(`${table}: ${from} source rows, ${to} imported`);
    console.log('Import complete. Every site key and MFA secret decrypts with the current MASTER_KEY.');
}
catch (e) {
    console.error('Import failed, nothing was written:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
}
finally {
    await source.end();
    closeDatabase();
}
