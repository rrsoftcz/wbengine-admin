import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'wbengine-admin-db-'));
process.env.DATABASE_PATH = join(directory, 'data', 'admin.sqlite');
const { transaction, read, rows, closeDatabase, database, timestamp, isUniqueViolation, minutesAgo } = await import('../src/lib/server/db.ts');
await transaction(async (c) => {
    await c.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT UNIQUE, flag INTEGER, at TEXT)');
});
after(async () => {
    closeDatabase();
    await rm(directory, { recursive: true, force: true });
});
test('writes report insertId and affectedRows, arguments are converted', async () => {
    const [a] = await transaction(c => c.execute('INSERT INTO t(v,flag,at) VALUES (?,?,?)', ['a', true, new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6))]));
    assert.deepEqual(a, { insertId: 1, affectedRows: 1 });
    const [row] = await transaction(c => rows<{ flag: number; at: string }>(c, 'SELECT flag,at FROM t WHERE id=?', [1]));
    assert.deepEqual(row, { flag: 1, at: '2026-01-02 03:04:05.006' });
    assert.equal(timestamp(new Date(Date.UTC(2026, 10, 2))), '2026-11-02 00:00:00.000');
    const [update] = await transaction(c => c.execute('UPDATE t SET flag=? WHERE v=?', [false, 'a']));
    assert.equal((update as { affectedRows: number }).affectedRows, 1);
    assert.equal((await transaction(c => rows(c, 'SELECT id FROM t LIMIT ?', [1]))).length, 1);
    await assert.rejects(transaction(c => c.execute('SELECT ?', [undefined as never])));
});
test('an error rolls the whole transaction back', async () => {
    await assert.rejects(transaction(async (c) => {
        await c.execute('INSERT INTO t(v) VALUES (?)', ['rolled-back']);
        throw Error('boom');
    }), /boom/);
    assert.equal((await transaction(c => rows(c, "SELECT id FROM t WHERE v='rolled-back'"))).length, 0);
});
test('a unique violation is recognised', async () => {
    await assert.rejects(transaction(c => c.execute('INSERT INTO t(v) VALUES (?)', ['a'])), (e) => isUniqueViolation(e));
    assert.equal(isUniqueViolation(Error('other')), false);
});
test('transactions never interleave, even with an await inside', async () => {
    const order: string[] = [];
    const slow = transaction(async (c) => {
        order.push('slow:start');
        await c.execute('INSERT INTO t(v) VALUES (?)', ['slow']);
        await new Promise(r => setTimeout(r, 80));
        order.push('slow:end');
    });
    const fast = transaction(async (c) => {
        order.push('fast:start');
        await c.execute('INSERT INTO t(v) VALUES (?)', ['fast']);
        order.push('fast:end');
    });
    await Promise.all([slow, fast]);
    assert.deepEqual(order, ['slow:start', 'slow:end', 'fast:start', 'fast:end']);
});
test('a failed transaction does not block the next one', async () => {
    await assert.rejects(transaction(async () => { throw Error('first'); }));
    assert.equal((await transaction(async () => 'next')), 'next');
});
test('a nested transaction is refused instead of deadlocking', async () => {
    await assert.rejects(transaction(async () => transaction(async () => 1)), /inside another transaction/);
});
test('commit() keeps a change when an error follows (failed-attempt counters)', async () => {
    await assert.rejects(transaction(async (c) => {
        await c.execute('INSERT INTO t(v) VALUES (?)', ['kept']);
        await c.commit();
        throw Error('after commit');
    }), /after commit/);
    assert.equal((await transaction(c => rows(c, "SELECT id FROM t WHERE v='kept'"))).length, 1);
});
test('time helpers compare as text in the stored format', async () => {
    const [r] = await transaction(c => rows<{ older: number }>(c, `SELECT (${minutesAgo(5)} < strftime('%Y-%m-%d %H:%M:%f','now')) AS older`));
    assert.equal(r.older, 1);
    assert.throws(() => minutesAgo(1.5));
    assert.throws(() => minutesAgo('1; DROP TABLE t' as never));
});
test('files are private and a backup is a consistent private copy', async () => {
    assert.equal((await stat(process.env.DATABASE_PATH!)).mode & 0o777, 0o600);
    for (const f of await readdir(join(directory, 'data')))
        assert.equal((await stat(join(directory, 'data', f))).mode & 0o077, 0, f);
    const target = join(directory, 'backup.sqlite');
    database().backup(target);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    const { DatabaseSync } = await import('node:sqlite');
    const copy = new DatabaseSync(target, { readOnly: true });
    assert.ok(Number((copy.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n) >= 3);
    copy.close();
});
test('a read does not queue behind a running transaction and sees only committed data', async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => release = r), inside = new Promise<void>(r => entered = r);
    const writing = transaction(async (c) => {
        await c.execute('INSERT INTO t(v) VALUES (?)', ['uncommitted']);
        entered();
        await gate;
    });
    await inside;
    const seen = await Promise.race([read(c => rows(c, "SELECT id FROM t WHERE v='uncommitted'")), new Promise<'blocked'>(r => setTimeout(() => r('blocked'), 1000))]);
    assert.deepEqual(seen, []);
    release();
    await writing;
    assert.equal((await read(c => rows(c, "SELECT id FROM t WHERE v='uncommitted'"))).length, 1);
    await assert.rejects(read(c => c.execute('INSERT INTO t(v) VALUES (?)', ['x'])));
});
test('an early commit followed by a normal return does not fail', async () => {
    assert.equal(await transaction(async (c) => {
        await c.execute('INSERT INTO t(v) VALUES (?)', ['early']);
        await c.commit();
        return 'done';
    }), 'done');
});
test('a backup creates its private target directory', async () => {
    const target = join(directory, 'new-backups', 'x.sqlite');
    database().backup(target);
    assert.equal((await stat(join(directory, 'new-backups'))).mode & 0o777, 0o700);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
});
test('the data directory is private even when it existed with wider rights', async () => {
    assert.equal((await stat(join(directory, 'data'))).mode & 0o777, 0o700);
});
