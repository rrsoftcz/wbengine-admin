import { readdir, readFile } from 'node:fs/promises';
import { rows, type Connection } from './db.ts';
const directory = new URL('../../../migrations/', import.meta.url);
/** Applies each migrations/NNN-*.sql once and records it. Call it inside a transaction: a failing file leaves nothing behind. */
export async function migrate(c: Connection, folder: URL = directory) {
    await c.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const applied = new Set((await rows<{ name: string }>(c, 'SELECT name FROM schema_migrations')).map(r => r.name)), ran: string[] = [];
    for (const file of (await readdir(folder)).filter(f => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort()) {
        if (applied.has(file))
            continue;
        await c.exec(await readFile(new URL(file, folder), 'utf8'));
        await c.execute('INSERT INTO schema_migrations(name) VALUES (?)', [file]);
        ran.push(file);
    }
    return ran;
}
