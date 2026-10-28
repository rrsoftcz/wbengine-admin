# WBengine Admin

Samostatná centrála pro WBengine API v2: SvelteKit 3.1.0, Svelte 5, TypeScript, adapter-node 6 a MySQL 8.4. Prohlížeč komunikuje pouze s centrálou. Obsah zůstává na jednotlivých webech.

Projekt obsahuje účty na pozvánku, hesla, povinné TOTP, záložní kódy, obnovu hesla, SQL sessions, oprávnění po webech, registr a discovery vzdáleného API. Obsahový editor v `/content/{id}` spravuje články, stránky, menu, sekce, registrované boxy, překlady a veřejné rastrové obrázky. Podporuje koncepty, soukromý náhled, explicitní publikování, revize, strukturální obnovu a ruční řešení konfliktů. Přehled první strany v `/analytics/{id}` zobrazuje agregovaná zobrazení. Každá operace vyžaduje současně centrální roli, scope integračního klíče a capability webu.

## Dokumentace

- [Plán a stav implementace](docs/plan-admin-implementation.md)
- [Historie změn](docs/ref-changelog.md)

## Lokální ověření

Node 22.18 nebo novější, pro kontejner Node 24. Závislosti jsou zamčené v package-lock.json.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run test:mysql
```

Poslední příkaz sestaví aplikaci, vytvoří vlastní Compose projekt s náhodným názvem a portem a MySQL 8.4, vygeneruje dočasná hesla mimo repozitář, provede databázové i skutečné HTTP testy a odstraní pouze svůj projekt včetně jeho testovacího volume. Vyžaduje přístup k lokálnímu Dockeru. Nespojuje se s existujícími databázemi. Samostatný `npm run test:integration` vyžaduje DATABASE_URL do databáze s názvem wbengine_admin_test a MASTER_KEY.

HTTP smoke simuluje TLS terminaci pomocí přímého loopback spojení. Ověřuje cookie flags, CSRF, přesměrování přes MFA, rotaci session, registr a odhlášení. Nenahrazuje ověření certifikátu a proxy v cílovém provozu.

## Konfigurace a spuštění

Zkopírujte `.env.example` do `.env` a lokálně doplňte náhodná hesla a MASTER_KEY: 32 náhodných bajtů v hex formátu. Hlavní klíč uchovávejte v provozním secret store mimo databázi. Při obnově databáze je potřebný odpovídající hlavní klíč. Rotace master key vyžaduje kontrolované přešifrování dat; automatická rotace není součástí této etapy.

DATABASE_URL v Compose používá host `db`. Pro CLI spuštěné na hostiteli použijte vlastní URL s hostem 127.0.0.1 a publikovaným lokálním portem. Runtime i CLI čtou proměnné prostředí; CLI je samo nenačítá z `.env`. Přihlašovací údaje nevkládejte do historie shellu.

```sh
docker compose up -d db
npm run admin -- migrate
docker compose up -d --build app
```

App poslouchá na 127.0.0.1:13000 a předpokládá HTTPS reverse proxy. ORIGIN musí být přesný HTTPS origin bez koncového lomítka. Adapter-node 6 ve výchozím stavu odvozuje HTTPS origin z Host hlavičky, centrála jej navíc porovnává s ORIGIN. Proxy musí předávat správný Host a odstraňovat nebo přepisovat vlastní forwarded hlavičky. Důvěryhodné proxy hlavičky nejsou zapnuté. Secure cookies se nevypínají ani ve vývoji; pro ruční použití je třeba lokální HTTPS proxy.

Aplikace sama nepouští DDL při každém požadavku. Migraci proveďte před spuštěním každé verze, která přidává soubor v `migrations/`: příkaz `migrate` aplikuje každý soubor `NNN-*.sql` jednou a eviduje jej v tabulce `schema_migrations`. V Docker image je CLI i migrační SQL: lze použít `docker compose run --rm app npm run admin -- migrate`. Image běží jako uživatel node, databáze má samostatného aplikačního uživatele.

## Správa důvěryhodným CLI

CLI provádí administrativní operace přímo na serveru. Přístup k němu a prostředí je privilegovaný provozní přístup. Nic automaticky neodesílá e-mailem ani jiným kanálem.

```sh
npm run admin -- invite admin@example.com global
npm run admin -- invite editor@example.com member 1 editor
npm run admin -- recover admin@example.com
npm run admin -- users
npm run admin -- revoke 12 1
npm run admin -- site-add 'Ukázkový web' https://example.com/
```

`invite` vydá jednorázový token s platností 48 hodin. Správce jej předá bezpečným kanálem, uživatel otevře `/accept` a vloží token do formuláře. První globální správce vzniká stejným postupem. Neexistuje veřejná registrace ani výchozí účet. Pozvánka pro již existující e-mail nevytváří další účet ani nepřidává role.

`recover` vydá jednorázový token s platností 30 minut pro `/recover`; starší nepoužité tokeny zneplatní. Změna hesla zruší všechny sessions a zachová MFA. Ztrátu TOTP řeší jednorázový záložní kód; webové vypnutí MFA ani obnova přes pouhé heslo nejsou dostupné.

`site-add` vyžaduje integrační klíč na stdin, nikoli jako argument. Předejte jej přes zabezpečený pipe ze secret store nebo privátní soubor. Při použití klávesnice CLI operaci odmítne, aby klíč nebyl echo v terminálu. Klíč nesmí být ve shell historii. CLI před uložením klíč ověří stejnou funkcí jako webový formulář. Běžná cesta je webová: globální správce s MFA přidá web na stránce `/sites` (název, HTTPS adresa, integrační klíč vydaný na cílovém webu), klíč se před uložením ověří přes `capabilities` a `identity` a je uložen jen šifrovaně. Stejná stránka umožňuje výměnu klíče: nový klíč se ověří, teprve poté se přepíše uložený a správce odvolá starý klíč na cílovém webu. Klíč se nikdy nevrací do prohlížeče. Globální správce vidí všechny weby bez grantu, ostatním účtům se přidělují siteadmin/editor výběrem podle e-mailu. `revoke` odebere konkrétní webové oprávnění. Změna role nebo odebrání oprávnění zruší sessions dotčeného uživatele.

## Bezpečnostní hranice

- Hesla: scrypt s náhodnou solí, délka 14 až 256 znaků. Heslové a MFA pokusy mají persistentní limity 8 a 12 pokusů za 15 minut. Přihlášení drží zámek řádku uživatele od čtení hesla do vytvoření session, souběžná změna hesla nebo deaktivace proto nemůže vytvořit novou session podle starého stavu.
- Sessions: databáze obsahuje pouze SHA-256 tokenu, expiraci a CSRF vazbu. Cookie `__Host-wbadmin` má Secure, HttpOnly a SameSite=Strict; životnost 8 hodin. Po MFA se token a CSRF rotují. Všechny měnící formuláře mají session CSRF i kontrolu originu, včetně přihlášení a přípravy MFA.
- MFA: TOTP SHA-1, 6 číslic, 30 sekund, tolerance jednoho časového kroku. Přijatý counter je uložen atomicky a nelze jej použít znovu. Deset náhodných záložních kódů se ukáže jednou, v DB jsou jen hashe. Enrollment secret se jednorázově ukazuje vlastnímu přihlašovanému účtu při nastavení, v DB je šifrovaný.
- Tajemství: AES-256-GCM, náhodný IV a autentizovaný kontext konkrétního webu/účtu. Integrační klíče se nevrací v HTML, formulářových chybách, API odpovědích ani auditu. Chybový handler nevypisuje výjimky s přihlašovacími údaji.
- Oprávnění: kontrola na serveru pro každý přístup, grants jsou vázané na dvojici user/site. Editor smí číst svůj web, upravovat článkové koncepty a jejich překlady a nahrávat veřejné obrázky. Siteadmin navíc mění strukturu, publikuje a odstraňuje obsah, global admin spravuje i registr. Vzdálená identita ani auditní štítek aktéra nepřidělují centrální role. Aktuální registry UI je vyhrazeno global admin.
- Vzdálené API: pouze konečný seznam resource/operation pod `/api/v2/`, žádný libovolný URL proxy endpoint, žádné redirects, ověřené TLS, celkový 8s deadline od začátku DNS přes TLS až po dokončení těla a limit odpovědi 1 MiB. Odmítnutí, timeout a abort zavírají request i response, odmítnutá odpověď se nedočítá. Identity používá Bearer klíč se scope discovery:read. Discovery je veřejné a nedostává Authorization.
- SSRF: pouze HTTPS port 443, bez credentials/query/fragment. Před každým spojením se ověří všechny DNS odpovědi a skutečný HTTPS socket používá pouze validovanou IP přes pinned lookup. Zakázané jsou lokální, privátní, link-local, multicast, dokumentační, mapované a vybrané přechodové IPv4/IPv6 rozsahy. Socket neprovádí druhé DNS vyhodnocení. Politika IPv6 je záměrně konzervativní.
- Intranet je možný pouze po provozním schválení konkrétních IP v `REMOTE_IP_ALLOWLIST`, odděleně od registrace webu. Neexistuje globální allowPrivate. Výjimka neruší TLS validaci ani zákaz redirectů. Mějte i síťový egress firewall jako další vrstvu.

Audit obsahuje pouze identifikátory, pevný název operace a čas. Neobsahuje těla požadavků, klíče, hesla ani MFA kódy. Expirované sessions, použité pozvánky a recovery záznamy zatím maže provozní údržba; automatická retenční úloha není zapnutá.

Architektura navazuje na [oficiální adapter-node](https://svelte.dev/docs/kit/adapter-node), [server actions](https://svelte.dev/docs/kit/form-actions) a server-only adresář `src/lib/server`. Kit 3 používá konfiguraci ve vite.config.ts, `$app/tsconfig` a package subpath import `#lib/*`. Obsahový serverový gateway používá konečný allowlist resource/operation, silné ETag a kontrolu site grants. Při HTTP 412 zachová přesný rozepsaný obsah i původní ETag. Ruční sloučení je samostatná operace pouze pro čtení aktuální verze, následné uložení je výslovné. Náhled je v iframe bez sandbox výjimek a s restriktivní CSP, externí média a skripty jsou blokované. Obrázky do 512 KiB jsou po nahrání veřejné a UI vyžaduje potvrzení této vlastnosti.


## Analytika WBengine

Dashboard `/analytics/{id}` je dostupný uživatelům s grantem k danému webu a jen pokud vzdálený integrační klíč obsahuje `analytics:read` a API oznamuje `capabilities.analytics.read`. Klíč zůstává na serveru. Přehled nabízí denní, týdenní a měsíční agregace, nejnavštěvovanější stránky a články, nejčastější výskyty boxů a celoživotní součty.

Výchozí období obsahuje 30 kalendářních dat končících předchozím dnem UTC. Díky tomu administrace nepožádá web o budoucí místní datum, pokud je jeho časové pásmo za UTC. Denní hranice odpovědi se řídí časovým pásmem cílového webu. Období před prvním zaznamenaným veřejným zobrazením jsou označena jako neúplná.

## Připojení nového webu

Požadavky na cílovém webu: WBengine 4.2.0 nebo novější, zapnuté `apiV2` v `Settings.json`, HTTPS a aplikované migrace frameworku `4.0.0/002` a `4.0.0/007` (`doctor` je hlásí jako `migration.002` a `migration.007`).

1. Na cílovém webu se přihlaste jako ADMIN, otevřete stránku Integrace, potvrďte heslo a vydejte klíč. Zobrazí se jednou: adresa webu, doporučený název a klíč.
2. V centrálním Adminu otevřete Weby, zvolte Přidat web a vložte název, HTTPS adresu a klíč. Před uložením se ověří `capabilities` a `identity`, klíč musí mít všech 17 scopes profilu Správa webu (volitelně navíc `analytics:read`).
3. Chyby se zobrazují jako konkrétní pokyn: chybějící API nebo migrace, neplatný klíč, chybějící scope, nedostupný web, duplicitní adresa, omezení pokusů (HTTP 429, zkuste za několik minut).
4. Výměna klíče: vydejte na webu nový klíč (volba nahrazované integrace), vložte jej v Adminu u webu do Vyměnit integrační klíč a teprve po ověření odvolejte starý klíč na cílovém webu. Ztracený klíč nelze zobrazit znovu, postup je stejný jako při výměně.

Na cílovém webu je před zapnutím potřeba ručně aplikovat `migrations/4.0.0/006-analytics.sql` z WBengine a přidat do `Settings.json` například:

```json
"analytics": {
  "enabled": true,
  "timezone": "Europe/Prague",
  "retentionDays": 62
}
```

Denní agregace se po 62 dnech odstraňují, celoživotní součty stránek a boxů zůstávají v `cms_analytics_totals`. Celoživotní počet článků vychází z původního `cms_articles.views`. Nové denní řady začínají až po zapnutí, starší denní historie se nedopočítává. Lokální provozní údržbu lze spustit přes frameworkové CLI, například `php vendor/wbengine/wbengine/bin/wbengine.php analytics:prune --config=/path/to/src/Config/Settings.json`; příkaz odstraní nejvýše 1000 starých denních řádků na jedno spuštění.

Analytika ukládá pouze souhrnné počty podle data a ID obsahu. Nezaznamenává IP adresy, cookies, uživatelská ID, User-Agent, referrer, query parametry ani individuální návštěvy. Návštěvnost se proto označuje jako zobrazení, nikoli unikátní osoby. Neznámé robotické požadavky se počítají stejně jako ostatní veřejné požadavky. Cache HIT a odpovědi 304 se zahrnují; výskyt boxu označuje neprázdný vygenerovaný výstup v odpovědi, nikoli potvrzení jeho zobrazení na obrazovce.

Článkový formulář ukládá koncept. Tlačítko publikování zveřejní pouze poslední uložený koncept; neuložené změny ve formuláři nejsou jeho součástí. Náhled zobrazuje uložený koncept, případně zvolený překlad, v samostatném sandboxu. Obnova revize znovu vytvoří koncept a nepublikuje jej automaticky.

Struktura se ukládá přímo. Po odstranění stránky, menu, sekce nebo boxu zůstane otevřená historie pro obnovu. Pro dříve odstraněný záznam lze v kolekci zadat jeho ID. Obnova používá vlastní recovery ETag z historie; běžný detail ETag jej nenahrazuje. API při obnově znovu ověřuje vazby, překlady i dostupné registrované boxy.

Při konfliktu se neprovádí automatický retry. Uživatel může svoje změny zahodit a načíst vzdálený stav, nebo si zobrazí aktuální obsah a výslovně převezme jeho ETag pro ruční sloučení. Tato operace sama nic nezapisuje. Změny poté zkontroluje a uloží samostatně.

`tests/api-pilot.ts` ověřuje skutečné centrální HTML formuláře proti aktuálnímu PHP API přes ověřené HTTPS. Poskytovatel fixture je ve frameworkovém projektu `tests/pilot/`. Používá vlastní Docker síť, databáze, generovanou CA a klíče mimo Git. Consumer potřebuje `PILOT_API_URL`, `PILOT_API_KEY`, `DATABASE_URL` končící `/wbengine_admin_pilot`, `MASTER_KEY`, `REMOTE_IP_ALLOWLIST` a `NODE_EXTRA_CA_CERTS`. Test se spouští uvnitř produkční image s mountem tohoto adresáře tests a runtime CA, nikoli proti produkčnímu webu. Nevyžaduje vypnutí TLS ověřování a nevypisuje klíče.


Společná CI administrace nyní používá dvě skutečně nezávislé API instalace. Stejně lokálně:

```sh
sh /path/to/wbengine/tests/pilot/pilot.sh start
sh /path/to/wbengine/tests/pilot/pilot.sh probe
sh /path/to/wbengine/tests/pilot/pilot.sh consumer /path/to/wbengine-admin
sh /path/to/wbengine/tests/pilot/pilot.sh backup-check
sh /path/to/wbengine/tests/pilot/pilot.sh reset
```

Příprava obrazů a oprávnění je popsána v jádru tests/pilot/ref-pilot.md. Finite testovací ovládání výpadku/revokace nepřidává Docker socket ani veřejný řídicí endpoint do centrály. Při nedostupném nebo odmítnutém spojení zůstává odeslaný formulář a ETag ve stejném requestu zachován; další pokus je ruční a znovu kontroluje veškerá oprávnění.
