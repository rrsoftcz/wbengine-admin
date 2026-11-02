import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
// SQLite can reach outside its file (ATTACH DATABASE) when an injection succeeds, so no SQL text may be built from input.
// Only these fixed fragments may be interpolated into a statement; everything user supplied goes through `?` arguments.
const allowed = [/^NOW$/, /^minutesAgo\((\d+|attemptWindowMinutes)\)$/, /^Number\(\w+\)$/, /^where$/, /^ids\.map\(\(\) => '\?'\)\.join\(','\)$/, /^PAGE_SIZE_USERS$/];
async function* sources(dir: string): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory())
            yield* sources(path);
        else if (/\.(ts|svelte)$/.test(entry.name))
            yield path;
    }
}
test('SQL statements interpolate only fixed fragments', async () => {
    const found: string[] = [];
    for (const root of ['src/lib/server', 'src/routes'])
        for await (const file of sources(root)) {
            const text = await readFile(file, 'utf8');
            for (const m of text.matchAll(/`([^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*)`/g))
                for (const e of m[1].matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g))
                    if (!allowed.some(a => a.test(e[1].trim())))
                        found.push(`${file}: \${${e[1]}}`);
        }
    assert.deepEqual(found, []);
});
test('a database file is never attached from code', async () => {
    for await (const file of sources('src'))
        assert.ok(!/ATTACH\s+DATABASE/i.test(await readFile(file, 'utf8')), file);
});
