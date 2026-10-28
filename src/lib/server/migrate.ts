import { readdir, readFile } from 'node:fs/promises';
import type { Connection } from './db.ts';
const directory = new URL('../../../migrations/', import.meta.url);
/** Statements end with a semicolon at the end of a line; full-line comments are ignored. */
export function statements(source: string) {
    return source.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(/;[ \t]*(?:\r?\n|$)/).map(x => x.trim()).filter(Boolean);
}
/** Applies each migrations/NNN-*.sql once and records it. Migrations must be one atomic or idempotent step per file. */
export async function migrate(c: Connection, folder: URL = directory) {
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) CHARACTER SET ascii PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const [done] = await c.query('SELECT name FROM schema_migrations') as unknown as [{
        name: string;
    }[]];
    const applied = new Set(done.map(r => r.name)), ran: string[] = [];
    for (const file of (await readdir(folder)).filter(f => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort()) {
        if (applied.has(file))
            continue;
        for (const sql of statements(await readFile(new URL(file, folder), 'utf8')))
            await c.query(sql);
        await c.query('INSERT INTO schema_migrations(name) VALUES (?)', [file]);
        ran.push(file);
    }
    return ran;
}
