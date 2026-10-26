import { readFile } from 'node:fs/promises';
import { database, transaction, rows } from '../src/lib/server/db.ts';
import { provisionSite } from '../src/lib/server/sites.ts';
import { invite, issueRecovery } from '../src/lib/server/auth.ts';
const [command, ...args] = process.argv.slice(2);
try {
    if (command === 'migrate') {
        const source = await readFile(new URL('../migrations/001-foundation.sql', import.meta.url), 'utf8');
        const c = await database().getConnection();
        try {
            for (const sql of source.split(';').map(x => x.trim()).filter(Boolean))
                await c.query(sql);
        }
        finally {
            c.release();
        }
        console.log('Schéma připraveno');
    }
    else if (command === 'invite') {
        const [email, level, site, role] = args;
        if (!email || !['global', 'member'].includes(level))
            throw Error('invite EMAIL global | invite EMAIL member [SITE_ID editor|siteadmin]');
        const raw = await invite(email, level === 'global', site ? Number(site) : null, (role ?? null) as 'editor' | 'siteadmin' | null);
        console.log('Jednorázový token pozvánky, předejte bezpečným kanálem:');
        console.log(raw);
    }
    else if (command === 'recover') {
        if (!args[0])
            throw Error('recover EMAIL');
        console.log('Jednorázový token obnovy, předejte bezpečným kanálem:');
        console.log(await issueRecovery(args[0]));
    }
    else if (command === 'site-add') {
        if (!args[0] || !args[1] || process.stdin.isTTY)
            throw Error('site-add NAME HTTPS_URL, klíč předejte na stdin');
        let key = '';
        for await (const chunk of process.stdin) {
            key += chunk;
            if (key.length > 256)
                throw Error('Neplatný klíč');
        }
        await provisionSite(args[0], args[1], key.trim());
        console.log('Web zaregistrován');
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
        console.log('Oprávnění odebráno');
    }
    else
        throw Error('Příkazy: migrate, invite, recover, users, revoke');
}
catch (e) {
    console.error(e instanceof Error && e.message.startsWith('Příkazy:') ? e.message : 'Operace selhala. Ověřte parametry a připojení; citlivé údaje se nevypisují.');
    process.exitCode = 1;
}
finally {
    await database().end();
}
