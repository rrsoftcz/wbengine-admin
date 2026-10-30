import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Visible text in templates must come from the message catalog. Technical strings are allowed explicitly. */
const allowed = new Set(['WBengine', 'Markdown', 'https://www.example.com/', '&middot;']);

/** Removes every balanced {...} block (template expressions, blocks and tags). */
function stripBraces(source: string): string {
    let out = '', depth = 0;
    for (const ch of source) {
        if (ch === '{') depth++;
        else if (ch === '}' && depth > 0) depth--;
        else if (depth === 0) out += ch;
    }
    return out;
}

async function svelteFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await svelteFiles(path));
        else if (entry.name.endsWith('.svelte')) out.push(path);
    }
    return out;
}

test('templates contain no hardcoded visible text', async () => {
    const offenders: string[] = [];
    for (const file of await svelteFiles('src')) {
        let s = await readFile(file, 'utf8');
        s = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
        s = stripBraces(s);
        for (const m of s.matchAll(/>([^<>]*[A-Za-z]{3,}[^<>]*)</g)) {
            const text = m[1].replace(/\|/g, ' ').replace(/WBengine/g, ' ').trim();
            if (text && !allowed.has(text)) offenders.push(`${file}: ${text.slice(0, 60)}`);
        }
        for (const m of s.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*[A-Za-z]{3,}[^"]*)"/g))
            if (!allowed.has(m[1])) offenders.push(`${file}: attribute ${m[1].slice(0, 60)}`);
    }
    assert.deepEqual(offenders, [], 'Move this text to src/lib/i18n/en and use t()');
});

test('form actions and load functions do not return hardcoded English messages', async () => {
    const offenders: string[] = [];
    const scan = async (dir: string) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) { await scan(path); continue; }
            if (!/\+(page|layout)\.server\.ts$|\+server\.ts$/.test(entry.name)) continue;
            const s = await readFile(path, 'utf8');
            for (const m of s.matchAll(/(?:fail\(\d+,\s*\{\s*(?:error|message):\s*|error\(\d+,\s*)'([A-Z][^']{8,})'/g)) offenders.push(`${path}: ${m[1].slice(0, 60)}`);
        }
    };
    await scan('src/routes');
    assert.deepEqual(offenders, []);
});
