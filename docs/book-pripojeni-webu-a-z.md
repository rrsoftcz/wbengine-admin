# Průvodce: od nového webu po správu v centrální administraci

Tento průvodce vede od prázdného serveru po web, který se spravuje z WBengine Adminu. Je určený člověku, který nic nezná: nevyžaduje předchozí znalost frameworku, SvelteKitu ani databáze. Každý krok říká, co udělat, co uvidíte a co dělat, když to nefunguje.

## Jak systém funguje

- **WBengine** je PHP framework. Web postavený na něm (například ukázkový `wbengine-skeleton-app`) má vlastní databázi, vlastní obsah a vlastní účty.
- **WBengine Admin** je samostatná aplikace (SvelteKit), která spravuje obsah více takových webů. Obsah zůstává na webech, Admin si pamatuje jen adresu webu a šifrovaný integrační klíč.
- Propojení zajišťuje **API v2** na webu. Web vydá integrační klíč (`wbv2_` a 64 znaků), Admin jej uloží šifrovaně a pomocí něj volá API.
- **Dva druhy účtů, které spolu nesouvisejí.** Účet na webu (role `user`, `editor`, `admin`) slouží k přihlášení na web a k vydání klíče. Účet v Adminu (globální správce nebo člen s rolí na konkrétním webu, vždy s MFA) slouží ke správě obsahu. Přihlašovací údaje jednoho se nepoužijí u druhého.

Postup má osm kroků:

1. Postavit web na WBengine.
2. Vytvořit prvního správce webu.
3. Zapnout API v2 a migrace.
4. Nainstalovat WBengine Admin.
5. Vytvořit prvního správce Adminu a nastavit MFA.
6. Vydat integrační klíč na webu.
7. Přidat web v Adminu.
8. Spravovat obsah, oprávnění a klíče.

## 1. Postavit web na WBengine

Nejrychlejší cesta je ukázkový web `wbengine-skeleton-app`.

Lokální vyzkoušení (potřebujete Docker):

```sh
git clone https://github.com/rrsoftcz/wbengine-skeleton-app.git
cd wbengine-skeleton-app
docker compose up --build
```

Web poběží na `http://localhost:8080`. Čistý produkční server s Dockerem, Nginx a HTTPS popisuje `docs/deploy-vps-docker.md` ve skeletonu. Instalátor se spouští s veřejnou adresou webu: `./bin/setup-production.sh https://www.vase-domena.cz`. Sám nastaví `i18n.baseUrl` a důvěryhodnou proxy (`http.trustedProxies`), aby framework za Nginx poznal HTTPS. Bez toho stránka `/integrations/` odmítne vydat klíč s hláškou, že stránka nebyla rozpoznána jako HTTPS.

Pro propojení s Adminem potřebuje web **HTTPS** a **WBengine 4.2 nebo novější**. Kontrola verze: `docker compose exec web grep -A2 '"name": "wbengine/wbengine"' vendor/composer/installed.json`.

## 2. Vytvořit prvního správce webu

Co čekat po čisté instalaci:

- Lokální `docker compose up` obsahuje demo účet `admin@example.com` s heslem `changeme`. Je to jen pro váš počítač.
- Produkční instalátor demo heslo **zruší** (nahradí ho náhodným nepoužitelným). Dokud nevytvoříte správce, nelze se přihlásit.

Vytvoření správce (příkaz vyžádá heslo dvakrát a nezobrazuje ho):

```sh
docker compose -f docker-compose.production.yml exec web php bin/wbe user:create --email=vy@vase-domena.cz --role=admin
```

U lokálního stacku použijte `docker compose exec web php bin/wbe ...`. Přihlaste se na `/login/` e-mailem a heslem. Potom odstraňte demo účet:

```sh
docker compose -f docker-compose.production.yml exec web php bin/wbe user:delete --example --dry-run
docker compose -f docker-compose.production.yml exec web php bin/wbe user:delete --example
```

Příkaz odmítne běžet, pokud by nezůstal žádný jiný správce. Další příkazy: `user:list`, `user:password --email=...` (obnova zapomenutého hesla), `user:delete --email=...`. Příkazy vyžadují WBengine 4.3 nebo novější.

Když to nefunguje: hláška `vendor/bin/wbengine.php is missing` znamená, že neproběhla instalace závislostí (`bin/wbe install`). Hláška o chybějící DB znamená špatné údaje v `src/Config/Settings.json`.

## 3. Zapnout API v2 a migrace

Na webu musí platit tři věci:

1. V `src/Config/Settings.json` je `"apiV2": { "enabled": true }`. Produkční instalátor to nastavuje, u lokálního stacku to ověřte.
2. Jsou aplikované migrace frameworku `4.0.0/002-api-v2-integrations.sql` a `4.0.0/007-api-integration-last-used.sql`. Produkční instalátor skeletonu aplikuje migrace `002`, `005`, `006` a `007`. U lokálního stacku (`docker compose up`) se neaplikuje žádná, a stav ověříte příkazem:

   ```sh
   docker compose exec web php vendor/bin/wbengine.php migration:status --config=src/Config/Settings.json --root=src
   ```

   Chybějící migraci aplikujte ručně a před tím zálohujte databázi: `cat vendor/wbengine/wbengine/migrations/4.0.0/007-api-integration-last-used.sql | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'`.
3. Web je dostupný přes HTTPS.

Stránka `/integrations/` na webu tyto požadavky sama zkontroluje a vypíše, co chybí.

## 4. Nainstalovat WBengine Admin

Admin běží na vlastním serveru nebo na stejném (pod jinou doménou). Potřebuje Docker a HTTPS reverzní proxy (Nginx).

```sh
git clone https://github.com/rrsoftcz/wbengine-admin.git
cd wbengine-admin
cp .env.example .env
```

V `.env` vyplňte:

| Proměnná | Co vložit |
|----------|-----------|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | náhodná hesla (`openssl rand -hex 24`) |
| `DATABASE_URL` | stejné heslo jako `MYSQL_PASSWORD`, host `db` |
| `MASTER_KEY` | 64 hex znaků (`openssl rand -hex 32`); uložte jej i mimo server, bez něj se uložené klíče webů nedají dešifrovat |
| `ORIGIN` | přesná HTTPS adresa Adminu bez koncového lomítka, například `https://admin.vase-domena.cz` |

Spuštění (migrace běží v kontejneru, nepotřebujete Node):

```sh
docker compose up -d db
docker compose run --rm app npm run admin -- migrate
docker compose up -d --build app
```

Aplikace poslouchá na `127.0.0.1:13000`. Nginx ji musí zveřejnit přes HTTPS a předávat hlavičku `Host`. Konfigurace (certifikát vydá Certbot):

```nginx
location / {
    proxy_pass http://127.0.0.1:13000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

Bezpečnostní hlavičky (`Referrer-Policy`, `X-Content-Type-Options`, `Cache-Control`) nastavuje aplikace. Nenastavujte je v Nginx znovu: duplicitní `Referrer-Policy: no-referrer` způsobí chybu "Cross-site POST form submissions are forbidden".

Kontrola: `https://admin.vase-domena.cz/login` musí zobrazit přihlašovací formulář.

## 5. Vytvořit prvního správce Adminu a nastavit MFA

Admin nemá veřejnou registraci ani výchozí účet. První správce se zve z příkazové řádky na serveru:

```sh
cd wbengine-admin
docker compose run --rm app npm run admin -- invite vy@vase-domena.cz global
```

Příkaz vypíše jednorázový token (platí 48 hodin). Poté:

1. Otevřete `https://admin.vase-domena.cz/accept`, vložte token a zvolte heslo o délce nejméně 14 znaků.
2. Na stránce MFA zvolte Připravit nastavení MFA. Zobrazí se tajný klíč. Přidejte jej do autentizační aplikace (TOTP, SHA-1, 6 číslic, 30 sekund), zadejte vygenerovaný kód a uložte záložní kódy. Zobrazí se jen jednou.
3. Dál se přihlašujete na `/login` heslem a kódem z aplikace.

Obnova: `docker compose run --rm app npm run admin -- recover vy@vase-domena.cz` vydá token pro `/recover` (30 minut). Ztracený TOTP nahradí záložní kód. Seznam účtů: `npm run admin -- users`.

## 6. Vydat integrační klíč na webu

1. Na webu se přihlaste jako správce (krok 2) a otevřete `/integrations/`.
2. Odkaz na stránku najdete v profilu přihlášeného správce (`/profile/`, část Správa). Pokud stránka hlásí chybějící požadavek (API vypnuté, chybějící migrace, HTTP místo HTTPS), opravte jej podle návodu na stránce.
3. Potvrďte heslo, ponechte název `WBengine Admin` a vydejte klíč.
4. Stránka zobrazí **jednou** adresu webu, název a klíč. Nechte stránku otevřenou, dokud klíč nevložíte do Adminu. Web ukládá jen hash, ztracený klíč nelze zobrazit znovu: vydáte nový.

## 7. Přidat web v Adminu

1. V Adminu se přihlaste a otevřete Registr webů (`/sites`, odkaz Správa registru a oprávnění na úvodní stránce).
2. V části Přidat web vyplňte název, HTTPS adresu (například `https://www.vase-domena.cz/`) a vložte klíč.
3. Zvolte Ověřit a přidat web. Admin před uložením ověří adresu (DNS, certifikát), zavolá `capabilities` a `identity` a zkontroluje, že klíč má všech 17 oprávnění profilu Správa webu.
4. Při úspěchu se zobrazí ověřená integrace a odkaz Spravovat obsah. Při chybě se zobrazí pokyn, žádný záznam se neuloží.

Co znamenají hlášky:

| Hláška | Co udělat |
|--------|-----------|
| Klíč není platný nebo byl odvolán | vydat na webu nový klíč |
| Klíč nemá všechna oprávnění | vydat klíč s úplným profilem |
| API v2 na webu není dostupné | zapnout `apiV2`, aplikovat migrace (krok 3) |
| Web se nepodařilo kontaktovat | zkontrolovat adresu, DNS a platný HTTPS certifikát |
| Adresa míří do nepovolené sítě | web musí být na veřejné adrese, privátní a smyčkové adresy blokuje ochrana SSRF. Při webu na stejném serveru viz Odstraňování potíží, Admin a web na jednom serveru |
| Web dočasně omezil počet pokusů | počkat několik minut (web povolí jen omezený počet chyb na adresu) |
| Tento web už je zaregistrovaný | adresa je v Adminu jednoznačná |

Globální správce vidí všechny registrované weby bez dalšího oprávnění.

## 8. Spravovat obsah, oprávnění a klíče

- **Obsah**: Weby, vybrat web, Spravovat obsah (články, stránky, menu, sekce, boxy, překlady, obrázky). Změny jdou přes koncept, náhled a explicitní publikování.
- **Další lidé**: globální správce pozve účet příkazem `invite EMAIL member SITE_ID editor|siteadmin` na serveru Adminu a na stránce Weby, Oprávnění účtu k webu vybere účet podle e-mailu a roli.
- **Výměna klíče** (podezření na únik, plánovaná obměna): na webu vydat nový klíč, v Adminu u webu otevřít Vyměnit integrační klíč a vložit jej, a teprve po úspěšném ověření odvolat starý klíč na stránce `/integrations/` webu. Admin ukáže, kterou integraci odvolat.
- **Odvolání přístupu**: odvolejte klíč na webu, Admin přestane mít přístup okamžitě.

## Volitelně: analytika webu v Adminu

Stránka Analytika v Adminu zobrazí návštěvnost webu. Vyžaduje dvě věci na straně webu a každá se řeší zvlášť:

1. **Zapnout sběr analytiky na webu.** V `src/Config/Settings.json` nastavte `"analytics": { "enabled": true }` a aplikujte migraci `4.0.0/006-analytics.sql` frameworku (před tím zálohujte databázi; produkční instalátor ji aplikuje, ale sběr nechává vypnutý). Zapnutím se začnou ukládat agregované údaje o návštěvnosti veřejného webu, zvažte to z pohledu ochrany soukromí a souhlasů návštěvníků. Ověření: `vendor/bin/wbengine.php doctor --config=src/Config/Settings.json --root=src`.
2. **Vydat klíč s volbou Analytika.** Na stránce `/integrations/` webu zaškrtněte Analytika (volba je nabídnutá, jen když je krok 1 splněný). Klíč pak má 18 oprávnění místo 17. Klíč vydaný dříve analytiku nemá: vydejte nový a v Registru webů u webu zvolte Vyměnit klíč, starý poté odvolejte na webu.

Bez obojího stránka Analytika v Adminu přesně napíše, co chybí: vypnutá analytika na webu, nebo klíč bez oprávnění `analytics:read`.

## Odstraňování potíží

| Příznak | Příčina a řešení |
|---------|------------------|
| "Cross-site POST form submissions are forbidden" | `Referrer-Policy: no-referrer` v odpovědi nebo v Nginx. Má být `same-origin` jen z aplikace |
| Admin vrací 400 "Neplatný původ požadavku" | `ORIGIN` v `.env` neodpovídá adrese v prohlížeči nebo proxy nepředává `Host` |
| Přihlášení na web nejde po instalaci produkce | demo heslo je zrušeno, vytvořte správce (krok 2) |
| `/integrations/` vrací 403 | účet na webu nemá roli `admin` (`bin/wbe user:list`) |
| `/integrations/` hlásí, že stránka nebyla rozpoznána jako HTTPS | prázdné `http.trustedProxies` v `Settings.json` (instalátor jej nastavuje, u ručně zřízeného webu nastavte bránu Docker sítě a `forwardedHeaders` `x-forwarded-for`, `x-forwarded-proto`) a `i18n.baseUrl` s `https://` |
| Uložené klíče po obnově databáze nejdou použít | chybí původní `MASTER_KEY` |

### Admin a web na jednom serveru: "Adresa míří do nepovolené sítě"

Admin před uložením zjistí DNS adresy webu a odmítne vše, co není veřejné (smyčka 127.x, privátní sítě). Na jednom serveru se může stát, že resolver serveru vrátí pro váš web `127.0.1.1`, i když je v DNS správná veřejná adresa. Typická příčina: doména webu je v DNS CNAME na jméno serveru od poskytovatele (například `vmi123.contaboserver.net`) a cloud-init mapuje to jméno v `/etc/hosts` na `127.0.1.1`.

Ověření na serveru i v kontejneru Adminu:

```sh
getent ahosts www.vase-domena.cz
docker compose exec -T app node -e 'require("node:dns/promises").lookup("www.vase-domena.cz",{all:true}).then(r=>console.log(r))'
```

Pokud výpis obsahuje `127.0.1.1` nebo privátní adresu, opravte hostitele. V `/etc/hosts` ponechte u řádku `127.0.1.1` jen krátké jméno stroje (bez FQDN) a stejnou změnu proveďte v šabloně cloud-init, aby přežila restart:

```sh
sudo sed -i 's/^127\.0\.1\.1 {{fqdn}} {{hostname}}$/127.0.1.1 {{hostname}}/' /etc/cloud/templates/hosts.debian.tmpl
sudo sed -i 's/^127\.0\.1\.1 vmi123\.contaboserver\.net vmi123$/127.0.1.1 vmi123/' /etc/hosts   # upravte jména podle svého serveru
sudo resolvectl flush-caches
```

Ověření zopakujte, musí vrátit veřejnou IP. Spojení z kontejneru na veřejnou adresu téhož serveru pak obvykle funguje. Nepovolujte smyčkovou adresu přes `REMOTE_IP_ALLOWLIST`: uvnitř kontejneru by mířila na samotný kontejner, ne na web, a oslabila by ochranu. Allowlist je určený jen pro konkrétní schválené intranetové adresy. Nemáte-li k hostiteli přístup, lze kontejneru Adminu dát veřejné DNS servery přes `compose.override.yaml` (`services: app: dns: [1.1.1.1, 9.9.9.9]`), ale to nemění resolver hostitele.

Související dokumentace: README Adminu (provoz, CLI, bezpečnostní hranice), README a `docs/deploy-vps-docker.md` skeletonu, `ref-api-v2.md` a README frameworku (API v2, správa uživatelů z příkazové řádky) a stránky Začínáme a Centrální administrace na `https://www.wbengine.org/docs/`.
