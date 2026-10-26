import mysql from 'mysql2/promise';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
let pool: ReturnType<typeof mysql.createPool> | undefined;
export function database() {
    if (!process.env.DATABASE_URL)
        throw Error('Chybí DATABASE_URL');
    return pool ??= mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 8, dateStrings: true, timezone: "Z", multipleStatements: false });
}
export type Connection = PoolConnection;
export async function rows<T = Record<string, unknown>>(c: Connection, sql: string, args: (string | number | boolean | Date | null)[] = []): Promise<T[]> {
    const [result] = await c.execute<RowDataPacket[]>(sql, args);
    return result as T[];
}
export async function transaction<T>(action: (c: Connection) => Promise<T>): Promise<T> {
    const c = await database().getConnection();
    try {
        await c.beginTransaction();
        const r = await action(c);
        await c.commit();
        return r;
    }
    catch (e) {
        await c.rollback();
        throw e;
    }
    finally {
        c.release();
    }
}
