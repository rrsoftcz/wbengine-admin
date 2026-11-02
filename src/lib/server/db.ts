import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { chmodSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/** Row object returned by a SELECT. */
export type RowDataPacket = Record<string, unknown>;
/** Result of a write statement, the same shape the call sites already read. */
export interface WriteResult {
    insertId: number;
    affectedRows: number;
}
export type Argument = string | number | boolean | Date | null;
/** UTC text with milliseconds: the single time format of this database, comparable as plain text. */
export const NOW = "strftime('%Y-%m-%d %H:%M:%f','now')";
/** The moment `minutes` minutes ago in the same format. Only an integer is accepted, so the result is safe to embed in SQL. */
export function minutesAgo(minutes: number) {
    if (!Number.isInteger(minutes))
        throw Error('Invalid interval');
    return `strftime('%Y-%m-%d %H:%M:%f','now','-${minutes} minutes')`;
}
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
export function timestamp(d: Date) {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}
function bind(args: Argument[]) {
    return args.map((a) => {
        if (a === undefined)
            throw Error('Undefined SQL argument');
        if (a instanceof Date)
            return timestamp(a);
        if (typeof a === 'boolean')
            return a ? 1 : 0;
        // Integers are bound as INTEGER, never as REAL, so LIMIT and key comparisons behave.
        if (typeof a === 'number' && Number.isInteger(a))
            return BigInt(a);
        return a;
    });
}
/** True for a violated UNIQUE or PRIMARY KEY constraint. */
export function isUniqueViolation(e: unknown) {
    const x = e as { errcode?: number; message?: string } | null;
    return !!x && (x.errcode === 2067 || x.errcode === 1555 || /UNIQUE constraint failed/.test(x.message ?? ''));
}
/** A connection used inside one transaction. Methods stay async so call sites keep their shape. */
export class Connection {
    private cache = new Map<string, StatementSync>();
    private db: DatabaseSync;
    constructor(db: DatabaseSync) {
        this.db = db;
    }
    private statement(sql: string) {
        let s = this.cache.get(sql);
        if (!s) {
            if (this.cache.size >= 200)
                this.cache.clear();
            s = this.db.prepare(sql);
            this.cache.set(sql, s);
        }
        return s;
    }
    /** SELECT returns `[rows]`, a write returns `[{ insertId, affectedRows }]`. */
    async execute(sql: string, args: Argument[] = []): Promise<[RowDataPacket[]] | [WriteResult]> {
        const s = this.statement(sql);
        if (s.columns().length > 0)
            return [s.all(...bind(args)).map(r => ({ ...r }))];
        const r = s.run(...bind(args));
        return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }];
    }
    /** Commits early so a change survives an error thrown afterwards (a failed-attempt counter). The transaction helper then has nothing left to roll back. */
    async commit() {
        if (this.db.isTransaction)
            this.db.exec('COMMIT');
    }
    /** Runs one or more statements without parameters (migrations). */
    async exec(sql: string) {
        this.db.exec(sql);
    }
}
let handle: DatabaseSync | undefined;
let connection: Connection | undefined;
let reader: DatabaseSync | undefined;
let readConnection: Connection | undefined;
export function databasePath() {
    const path = process.env.DATABASE_PATH;
    if (!path)
        throw Error('Missing DATABASE_PATH');
    return resolve(path);
}
function open() {
    if (handle)
        return handle;
    const path = databasePath();
    // The file, its journal and every backup are private to this user. The umask is changed only while the files are created.
    const previous = process.umask(0o077);
    let db: DatabaseSync;
    try {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        chmodSync(dirname(path), 0o700);
        db = new DatabaseSync(path);
    }
    finally {
        process.umask(previous);
    }
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;');
    chmodSync(path, 0o600);
    connection = new Connection(db);
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON;');
    readConnection = new Connection(reader);
    return handle = db;
}
/** Opens the database on first use. */
export function database() {
    const db = open();
    return {
        /** Consistent online copy of the database, created private (mode 0600). */
        backup(target: string) {
            const path = resolve(target);
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
            if (statSync(dirname(path)).mode & 0o007)
                throw Error('Backup: the target directory is readable by everyone, use mode 0700');
            db.prepare('VACUUM INTO ?').run(path);
            chmodSync(path, 0o600);
        },
        end() {
            if (handle === db) {
                handle = undefined;
                connection = undefined;
                readConnection = undefined;
                reader?.close();
                reader = undefined;
                tail = Promise.resolve();
                db.close();
            }
        }
    };
}
export function closeDatabase() {
    if (handle)
        database().end();
}
export async function rows<T = Record<string, unknown>>(c: Connection, sql: string, args: Argument[] = []): Promise<T[]> {
    const [result] = await c.execute(sql, args);
    return result as T[];
}
// One connection serves the whole process, so every transaction waits for the previous one (this replaces row locks).
let tail: Promise<unknown> = Promise.resolve();
const inside = new AsyncLocalStorage<true>();
/** Runs `action` in a BEGIN IMMEDIATE transaction. Transactions never interleave; do not await slow work inside one. */
export function transaction<T>(action: (c: Connection) => Promise<T>): Promise<T> {
    if (inside.getStore())
        return Promise.reject(Error('A transaction cannot be started inside another transaction'));
    const run = async () => {
        open();
        const c = connection!, db = handle!;
        db.exec('BEGIN IMMEDIATE');
        try {
            const r = await inside.run(true, () => action(c));
            if (db.isTransaction)
                db.exec('COMMIT');
            return r;
        }
        catch (e) {
            if (db.isTransaction)
                db.exec('ROLLBACK');
            throw e;
        }
    };
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
}
/** Runs a read-only action on a separate connection: it never waits for a writer and sees only committed data (WAL). Use it for hot read paths such as session loading. */
export async function read<T>(action: (c: Connection) => Promise<T>): Promise<T> {
    open();
    return action(readConnection!);
}
