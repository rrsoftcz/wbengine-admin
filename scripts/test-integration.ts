import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
/** Runs the integration tests, each against its own fresh SQLite file in a private temporary directory. No Docker is needed. */
const directory = await mkdtemp(join(tmpdir(), 'wbengine-admin-test-'));
const master = randomBytes(32).toString('hex');
try {
    for (const file of ['tests/accounts.integration.ts', 'tests/profile.integration.ts', 'tests/users.integration.ts', 'tests/http.smoke.ts']) {
        const name = file.replace(/^tests\/|\.ts$/g, '').replace(/\W+/g, '-');
        const env = { ...process.env, DATABASE_PATH: join(directory, name, 'admin.sqlite'), MASTER_KEY: master, ORIGIN: 'https://admin.example.test' };
        const r = spawnSync(process.execPath, ['--experimental-strip-types', '--test', file], { stdio: 'inherit', env });
        if (r.status !== 0)
            throw Error(`The integration test failed: ${file}`);
    }
}
catch (e) {
    console.error(e instanceof Error ? e.message : 'The integration test failed');
    process.exitCode = 1;
}
finally {
    await rm(directory, { recursive: true, force: true });
}
