import { database, closeDatabase, transaction, rows } from '../src/lib/server/db.ts';
import { provisionSite } from '../src/lib/server/sites.ts';
import { migrate } from '../src/lib/server/migrate.ts';
import { invite, issueRecovery } from '../src/lib/server/auth.ts';
const [command, ...args] = process.argv.slice(2);
try {
    if (command === 'migrate') {
        const ran = await transaction(c => migrate(c));
        console.log(ran.length ? 'Applied: ' + ran.join(', ') : 'No new migration');
    }
    else if (command === 'invite') {
        const [email, level, site, role] = args;
        if (!email || !['global', 'member'].includes(level))
            throw Error('invite EMAIL global | invite EMAIL member [SITE_ID editor|siteadmin]');
        const raw = await invite(email, level === 'global', site ? Number(site) : null, (role ?? null) as 'editor' | 'siteadmin' | null);
        console.log('One-time invitation token, hand it over through a secure channel:');
        console.log(raw);
    }
    else if (command === 'recover') {
        if (!args[0])
            throw Error('recover EMAIL');
        console.log('One-time recovery token, hand it over through a secure channel:');
        console.log(await issueRecovery(args[0]));
    }
    else if (command === 'site-add') {
        if (!args[0] || !args[1] || process.stdin.isTTY)
            throw Error('site-add NAME HTTPS_URL, pass the key on stdin');
        let key = '';
        for await (const chunk of process.stdin) {
            key += chunk;
            if (key.length > 256)
                throw Error('Invalid key');
        }
        await provisionSite(args[0], args[1], key.trim(), null, true);
        console.log('Site registered');
    }
    else if (command === 'users') {
        console.log(await transaction(c => rows(c, 'SELECT id,email,global_admin,mfa_enabled,disabled FROM users ORDER BY id')));
    }
    else if (command === 'revoke') {
        const [user, site] = args;
        if (!/^\d+$/.test(user) || !/^\d+$/.test(site))
            throw Error('revoke USER_ID SITE_ID');
        await transaction(async (c) => {
            await c.execute('DELETE FROM grants WHERE user_id=? AND site_id=?', [Number(user), Number(site)]);
            await c.execute('DELETE FROM sessions WHERE user_id=?', [Number(user)]);
            await c.execute('INSERT INTO audit(user_id,site_id,event) VALUES (?,?,?)', [null, Number(site), 'grant.revoked.cli']);
        });
        console.log('Permission revoked');
    }
    else if (command === 'backup') {
        if (!args[0])
            throw Error('backup TARGET_FILE');
        database().backup(args[0]);
        console.log('Backup written (mode 0600). It holds ciphertext and password hashes: never store it together with MASTER_KEY.');
    }
    else
        throw Error('Commands: migrate, invite, recover, users, revoke, site-add, backup');
}
catch (e) {
    console.error(e instanceof Error && (e.message.startsWith('Commands:') || e.message.startsWith('Backup:')) ? e.message : 'The operation failed. Check the parameters and the connection; sensitive data is not printed.');
    process.exitCode = 1;
}
finally {
    closeDatabase();
}
