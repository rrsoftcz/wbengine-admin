import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'wbengine-admin-migrate-'));
process.env.DATABASE_PATH = join(directory, 'data', 'admin.sqlite');
const { transaction, rows, closeDatabase } = await import('../src/lib/server/db.ts');
const { migrate } = await import('../src/lib/server/migrate.ts');
after(async () => {
    closeDatabase();
    await rm(directory, { recursive: true, force: true });
});
test('the baseline migration applies once and creates a private database file', async () => {
    assert.ok((await transaction(c => migrate(c))).includes('001-baseline.sql'));
    assert.deepEqual(await transaction(c => migrate(c)), []);
    const tables = (await transaction(c => rows<{ name: string }>(c, "SELECT name FROM sqlite_master WHERE type='table'"))).map(r => r.name);
    for (const table of ['users', 'sites', 'grants', 'sessions', 'invitations', 'recovery', 'backup_codes', 'login_attempts', 'audit', 'schema_migrations'])
        assert.ok(tables.includes(table), table);
    assert.equal((await stat(process.env.DATABASE_PATH!)).mode & 0o777, 0o600);
    assert.equal((await stat(join(directory, 'data'))).mode & 0o777, 0o700);
});
test('a failing migration file leaves nothing behind', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'wbengine-admin-migrate-bad-'));
    await writeFile(join(folder, '001-bad.sql'), 'CREATE TABLE half (x INTEGER);\nTHIS IS NOT SQL;');
    await assert.rejects(transaction(c => migrate(c, new URL(`file://${folder}/`))));
    assert.equal((await transaction(c => rows(c, "SELECT name FROM sqlite_master WHERE name='half'"))).length, 0);
    await rm(folder, { recursive: true, force: true });
});
