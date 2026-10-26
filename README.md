# WBengine Admin

Samostatná centrála pro WBengine API v2: SvelteKit 3.1.0, Svelte 5, TypeScript, adapter-node 6 a MySQL 8.4. Prohlížeč komunikuje pouze s centrálou. Obsah zůstává na jednotlivých webech.

Tato etapa obsahuje ADM-01 až ADM-03: účty na pozvánku, hesla, povinné TOTP, záložní kódy, obnovu hesla, SQL sessions, oprávnění po webech, registr a discovery vzdáleného API. Obsahový editor, CRUD, revize, náhled a publikování patří do ADM-04/05 a nejsou implementované. Discovery zobrazuje skutečné read/write capabilities; nedokazuje dostupnost funkcí editoru centrály.

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

Aplikace sama nepouští DDL při každém požadavku. Migraci proveďte před spuštěním první verze. V Docker image je CLI i migrační SQL: lze použít `docker compose run --rm app npm run admin -- migrate`. Image běží jako uživatel node, databáze má samostatného aplikačního uživatele.

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

`site-add` vyžaduje integrační klíč na stdin, nikoli jako argument. Předejte jej přes zabezpečený pipe ze secret store nebo privátní soubor. Při použití klávesnice CLI operaci odmítne, aby klíč nebyl echo v terminálu. Klíč nesmí být ve shell historii. Registraci a rotaci klíčů nedělá webové UI; klíče se nikdy neposílají do prohlížeče. Připojení je dostupné jen globálním správcům, ti mohou přes UI přidělovat siteadmin/editor podle ID účtu z `users`. `revoke` odebere konkrétní webové oprávnění. Změna role nebo odebrání oprávnění zruší sessions dotčeného uživatele.

## Bezpečnostní hranice

- Hesla: scrypt s náhodnou solí, délka 14 až 256 znaků. Heslové a MFA pokusy mají persistentní limity 8 a 12 pokusů za 15 minut. Přihlášení drží zámek řádku uživatele od čtení hesla do vytvoření session, souběžná změna hesla nebo deaktivace proto nemůže vytvořit novou session podle starého stavu.
- Sessions: databáze obsahuje pouze SHA-256 tokenu, expiraci a CSRF vazbu. Cookie `__Host-wbadmin` má Secure, HttpOnly a SameSite=Strict; životnost 8 hodin. Po MFA se token a CSRF rotují. Všechny měnící formuláře mají session CSRF i kontrolu originu, včetně přihlášení a přípravy MFA.
- MFA: TOTP SHA-1, 6 číslic, 30 sekund, tolerance jednoho časového kroku. Přijatý counter je uložen atomicky a nelze jej použít znovu. Deset náhodných záložních kódů se ukáže jednou, v DB jsou jen hashe. Enrollment secret se jednorázově ukazuje vlastnímu přihlašovanému účtu při nastavení, v DB je šifrovaný.
- Tajemství: AES-256-GCM, náhodný IV a autentizovaný kontext konkrétního webu/účtu. Integrační klíče se nevrací v HTML, formulářových chybách, API odpovědích ani auditu. Chybový handler nevypisuje výjimky s přihlašovacími údaji.
- Oprávnění: kontrola na serveru pro každý přístup, grants jsou vázané na dvojici user/site. Editor smí číst svůj web, siteadmin spravovat svůj web, global admin spravovat registr. Vzdálená identita ani auditní štítek aktéra nepřidělují centrální role. Aktuální registry UI je vyhrazeno global admin.
- Vzdálené API: pouze pevné GET resources `capabilities` a `identity` pod `/api/v2/`, žádný libovolný URL proxy endpoint, žádné redirects, ověřené TLS, celkový 8s deadline od začátku DNS přes TLS až po dokončení těla a limit odpovědi 1 MiB. Odmítnutí, timeout a abort zavírají request i response, odmítnutá odpověď se nedočítá. Identity používá Bearer klíč se scope discovery:read. Discovery je veřejné a nedostává Authorization.
- SSRF: pouze HTTPS port 443, bez credentials/query/fragment. Před každým spojením se ověří všechny DNS odpovědi a skutečný HTTPS socket používá pouze validovanou IP přes pinned lookup. Zakázané jsou lokální, privátní, link-local, multicast, dokumentační, mapované a vybrané přechodové IPv4/IPv6 rozsahy. Socket neprovádí druhé DNS vyhodnocení. Politika IPv6 je záměrně konzervativní.
- Intranet je možný pouze po provozním schválení konkrétních IP v `REMOTE_IP_ALLOWLIST`, odděleně od registrace webu. Neexistuje globální allowPrivate. Výjimka neruší TLS validaci ani zákaz redirectů. Mějte i síťový egress firewall jako další vrstvu.

Audit obsahuje pouze identifikátory, pevný název operace a čas. Neobsahuje těla požadavků, klíče, hesla ani MFA kódy. Expirované sessions, použité pozvánky a recovery záznamy zatím maže provozní údržba; automatická retenční úloha není zapnutá.

Architektura navazuje na [oficiální adapter-node](https://svelte.dev/docs/kit/adapter-node), [server actions](https://svelte.dev/docs/kit/form-actions) a server-only adresář `src/lib/server`. Kit 3 používá konfiguraci ve vite.config.ts, `$app/tsconfig` a package subpath import `#lib/*`. Vzdálené obsahové operace se mají doplnit do serverové služby až po API-02/03, se samostatným allowlistem resource/operation a kontrolou site grants.
