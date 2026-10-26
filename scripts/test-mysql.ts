import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'wbengine-admin-test-')), envFile = join(directory, 'config.env'), project = `wbengine-admin-test-${process.pid}`;
const password = randomBytes(24).toString('hex'), rootPassword = randomBytes(24).toString('hex'), master = randomBytes(32).toString('hex');
await writeFile(envFile, `MYSQL_ROOT_PASSWORD=${rootPassword}\nMYSQL_PASSWORD=${password}\nMYSQL_PORT=0\nMASTER_KEY=${master}\nDATABASE_URL=mysql://unused\nORIGIN=https://admin.example.test\n`, { mode: 0o600 });
const base = ['compose', '--env-file', envFile, '-p', project];
function docker(args: string[], extraEnv: Record<string, string> = {}) {
    const r = spawnSync('docker', [...base, ...args], { encoding: 'utf8', env: { ...process.env, ...extraEnv } });
    if (r.status !== 0) {
        process.stderr.write(r.stderr ?? '');
        throw Error('Izolovaný Docker test selhal');
    }
    return r.stdout;
}
try {
    docker(['up', '-d', '--wait', '--wait-timeout', '90', 'db']);
    docker(['exec', '-T', '-e', 'MYSQL_PWD', 'db', 'mysql', '-uroot', '-e', 'CREATE DATABASE wbengine_admin_test; GRANT ALL PRIVILEGES ON wbengine_admin_test.* TO "wbadmin"@"%"; GRANT SELECT ON performance_schema.* TO "wbadmin"@"%";'], { MYSQL_PWD: rootPassword });
    const address = docker(['port', 'db', '3306']).trim(), port = address.slice(address.lastIndexOf(':') + 1);
    const env = { ...process.env, DATABASE_URL: `mysql://wbadmin:${password}@127.0.0.1:${port}/wbengine_admin_test`, MASTER_KEY: master };
    for (const file of ['tests/mysql.integration.ts', 'tests/http.smoke.ts']) {
        const r = spawnSync(process.execPath, ['--experimental-strip-types', '--test', file], { stdio: 'inherit', env });
        if (r.status !== 0)
            throw Error('Integrační test selhal');
    }
}
catch (e) {
    console.error(e instanceof Error ? e.message : "Test selhal");
    process.exitCode = 1;
}
finally {
    try {
        docker(['down', '-v', '--remove-orphans']);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
