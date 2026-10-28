# Plán bezpečné registrace WBengine webu v Adminu

## Cíl

Majitel WBengine webu musí připojit svůj web do WBengine Adminu přes webová rozhraní, bez SSH, terminálu, přímé práce s databází nebo ruční editace konfigurace. Registrace musí ověřit skutečné HTTPS API cílového webu a bezpečně předat integrační klíč centrále. Globální správce vidí všechny registrované weby bez dalšího grantu.

Tento dokument popisuje jedno cílové řešení: integrační klíč vydá přihlášený správce přímo na cílovém WBengine webu a jednorázově jej zkopíruje do registračního formuláře WBengine Adminu. Nebude se zavádět CLI-only onboarding ani samostatný párovací protokol.

## Proč se plán mění

Aktuální implementace má dvě nedokončené poloviny:

- WBengine API v2 ukládá jen hash integračního klíče a umí jej vydat přes důvěryhodný lokální `Wbengine\\Api\\V2\\Model::provision()`. Veřejný provisioning endpoint záměrně neexistuje. Uživatelské webové rozhraní pro správu klíčů ani příslušný provisioning CLI příkaz nejsou hotové.
- WBengine Admin má příkaz `site-add`, který očekává již vydaný klíč na stdin. Stránka `/sites` zobrazuje správu existujících registrací a grantů, ale nové weby přidává jen CLI. Proto je roletka Web prázdná, dokud není první registrace vytvořena.

Účet Radka je v centrální databázi `id=1`, `global_admin=1`, `mfa_enabled=1`. Globální správce má přístup ke všem webům bez grantu (`listSites` v `sites.ts` a `permitted()` v `security.ts`), proto registrace žádný grant nevytváří. Roletka Web je prázdná jen proto, že žádný web zatím není registrovaný. Granty zůstávají pro ostatní účty a ID účtu se v nich nahradí výběrem podle e-mailu.

## Uživatelský postup po dokončení

### A. Vydání klíče na cílovém webu

1. Správce se přihlásí do WBengine webu svým místním účtem s rolí `ADMIN`.
2. Otevře stránku „Integrace“ a zvolí „Připojit k WBengine Admin“.
3. Stránka před vydáním klíče ověří, že API v2 je zapnuté, požadované migrace jsou nainstalované, HTTPS je správně rozpoznané a správce má aktuálně v databázi roli `ADMIN`.
4. Správce zvolí jednoduchý účel klíče. Výchozí profil „Správa webu v WBengine Adminu” dostane jen scope potřebné pro aktuální funkce: discovery, čtení a editaci podporovaného obsahu, překlady, obrázky, náhled a publikaci. Analytika je závislost na budoucí verzi frameworku: whitelist `SCOPES` v `Api/V2/Model.php` scope `analytics:read` dnes neobsahuje (je jen v `plan-analytics.md`). Až jej framework vydá, přibude jako samostatně zapínatelné rozšíření profilu. Registrace nikdy nesmí analytiku vyžadovat. Rozhraní ukáže lidsky čitelné popisy, nikoli seznam nejasných interních scope.
5. Po výslovném potvrzení web vytvoří náhodný klíč `wbv2_…`. Do databáze uloží pouze jeho hash, scope, název integrace, místního správce a čas. Samotný klíč zobrazí pouze jednou v odpovědi POST s `Cache-Control: no-store`; nevloží jej do URL, logu, auditu, analytiky ani trvalého browser storage.
6. Stránka zobrazí úplnou instrukci pro další krok: adresu webu, doporučený název, scope a klíč s tlačítkem kopírovat. Uživatel může pokračovat do centrální administrace v jiné kartě. Po opuštění stránky již surový klíč nelze znovu zobrazit.

### B. Registrace v centrálním Adminu

1. Uživatel se přihlásí do `https://admin.wbengine.org` a ověří se povinným MFA.
2. Na stránce „Weby“ zvolí „Přidat web“.
3. Vyplní srozumitelně označená pole: název webu, základní HTTPS adresu webu a jednorázově zobrazený integrační klíč. Formulář výslovně uvede, že klíč zůstává uložen šifrovaně na serveru a nikdy se neposílá do prohlížeče cílových API požadavků.
4. Před uložením centrální server bezpečně normalizuje a prověří URL, provede DNS/SSRF kontrolu a ověří TLS certifikát. Poté zavolá veřejné `/api/v2/capabilities` a autentizované `/api/v2/identity` přes existující pinned HTTPS klient. Ověří API v2, platnost klíče, `discovery:read` a slučitelnost scope/capabilities s vybraným účelem.
5. Při chybě neuloží neověřený web ani klíč. Zobrazí konkrétní bezpečnou instrukci, například chybějící migrace, vypnuté API, neplatný klíč, chybějící scope, chybnou adresu, problém s HTTPS nebo již registrovaný web. Nikdy nezobrazí tajemství ani surovou výjimku.
6. Při úspěchu uloží web, šifrovaný klíč a nesekretní `integration_id` z odpovědi `/identity` v jedné DB transakci. Uloží auditní událost s přihlášeným správcem. Žádný grant se nevytváří, globální správce přístup již má. Pole s klíčem se vyprázdní a centrální databáze nesmí uchovávat jeho kopii v plaintextu.
7. Potvrzovací stránka zobrazí web, ověřenou identitu, dostupné funkce a odkaz „Otevřít web“. Web se ihned objeví v seznamu a další stránce pro obsah i analytiku.

## Hranice důvěry a bezpečnost

### WBengine

- Provisioning bude dostupný jen přihlášenému místnímu účtu s aktuální databázovou rolí `ADMIN`, nikdy pouze podle role uložené v JWT nebo skrytého formulářového pole. Před vydáním, rotací nebo odvoláním klíče bude vyžadováno čerstvé potvrzení hesla, aby odemčená dlouho běžící session nestačila k vydání integrace.
- Každá operace vydání, přejmenování, rotace a odvolání použije POST, existující session, CSRF ochranu a čerstvé ověření hesla WBengine. GET pouze zobrazuje stav.
- Funkce bude zapojená do stávající objektové architektury WBengine (`Application -> Site -> Section -> Box`) a namespaců `Wbengine\\Box\\…`, `Wbengine\\Api\\V2\\…`, případně odpovídajících modelů. Nevznikne izolovaný PHP skript nebo obecný provisioning endpoint.
- Raw klíč se vrací uživateli pouze jednou; databáze ukládá jeho hash. Vydávání i odvolání a audit jsou atomické. Při selhání auditu se operace vrátí zpět.
- Klíč má přesný prefix a kryptografickou entropii zavedenou API v2. Scope jsou ověřeny konečným whitelistem. Není možné zadat vlastní PHP třídu, operaci ani URL callbacku.
- Stav stránky a tajná odpověď budou `private, no-store`; stránka nesmí být cachována frameworkem, CDN ani sdílenou šablonovou cache. Klíč je jen v těle odpovědi, nikdy v URL, takže se do referreru nedostane. Stránka nastaví `Referrer-Policy: same-origin`, nikoli `no-referrer`: prohlížeč by u POST formulářů na stránce posílal `Origin: null` a kontroly původu by je odmítly (stejná chyba, jakou jsme opravili v Adminu). Hlavičku nastavuje pouze aplikace, nikoli zároveň nginx. Klíč se nepropíše do query stringu, error response ani telemetrie.
- Stránka zobrazí aktivní integrace pouze jako nevyzrazující metadata: název, vydávající správce, datum, scope a stav. Již vydaný klíč nelze přečíst zpět.
- Rotace: správce vytvoří nový klíč, centrální Admin ověří a nahradí uložené credentials, teprve potom správce odvolá starý klíč. UI ukáže pořadí, aby nevznikl výpadek. Obnova ztraceného klíče používá stejný postup. Scopes existujícího klíče nelze měnit, změna scopes vždy znamená nový klíč. Admin díky uloženému `integration_id` ukáže, který klíč má správce na webu odvolat, a odmítne nový klíč se stejným ID.
- Framework dnes nemá výpis integrací ani `last_used_at`. Obojí je součástí REG-02, bez toho nelze bezpečně poznat nepoužívaný klíč.
- Role ADMIN se vždy čte z databáze (`ApiUserModel::getAuthorization`). ACL ve stromě Application->Site->Section->Box rozlišuje jen přihlášeného a nepřihlášeného uživatele, kontrolu role proto musí provést samotný Box. Čerstvé potvrzení hesla ve frameworku neexistuje a staví se nad `User/Password.php`. Je to nejpracnější část REG-02.

### Centrální Admin

- Registrace je dostupná pouze `global_admin` účtu s ověřenou MFA session (`requireGlobal`). Audit zapisuje identitu ze session, ne hodnotu zaslanou klientem.
- Ověření klíče před uložením i výměna klíče sdílejí jednu funkci nad `remoteGet` (`capabilities`, `identity`). Stejnou funkci použije i CLI `site-add`, který klíč dnes před uložením neověřuje.
- Framework povoluje 10 neúspěšných autentizací za 300 s na IP a po úspěchu počítadlo nenuluje. Všechny weby a uživatelé Adminu sdílejí jednu odchozí IP, proto registrační formulář omezí počet pokusů a katalog chyb zahrnuje HTTP 429 s `Retry-After`.
- URL musí být HTTPS bez uživatelských údajů, query a fragmentu; povolený port je 443. Zůstává stávající DNS/IP validace, pinned lookup, zákaz redirectů, deadline a limit odpovědi. Žádná nová cesta nesmí obejít `remote.ts` ani SSRF politiku.
- Klíč se přijímá jen v HTTPS POST těle. Nesmí se objevit v URL, access logu, HTML po zpracování, session, auditním záznamu, analytice, chybové hlášce ani CLI výstupu. V centrální DB se ukládá pouze přes existující `SecretVault` šifrování s kontextem webu.
- Vzdálené ověření proběhne před DB transakcí. Následná transakce vloží web, zašifrovaný klíč, `integration_id` a audit společně. Unikátní normalizovaná URL zabrání duplicitám; souběžný pokus skončí bezpečnou a srozumitelnou chybou. Schéma dnes UNIQUE index na `base_url` nemá a `VARCHAR(2048)` se do indexu nevejde, proto migrace `002` přidá sloupec s hashem normalizované URL (host malými písmeny, cesta s koncovým `/`, bez portu 443) a nad ním UNIQUE.
- Po vytvoření další oprávnění zobrazí účty jako výběr podle e-mailu a role, ne jako neoznačené číselné ID. Systém ID interně používá, člověk ho nemusí zjišťovat.
- Chyby vzdáleného API budou převáděny na konečný katalog bezpečných pokynů. Klíče a interní síťové detaily se nevrací do HTML.

## Fáze realizace

### REG-01: Kontrakt a předběžná kontrola

- Sepsat přesný scope profil pro současné funkce Adminu (zdroj pravdy `api-contract.ts` a `canOperate` v `content.ts`) a oddělit analytiku, dokud ji framework nevydává. Rozdíl mezi profilem Adminu a whitelistem frameworku hlídá kontraktní test v pilotu.
- Definovat stavové odpovědi a srozumitelné pokyny pro chybějící API v2, SQL migrace, chybné HTTPS, neplatný klíč, scope, duplicate URL, nedostupný web a HTTP 429 s `Retry-After`.
- Prověřit role/session/CSRF stávajícího WBengine webového přihlášení a zvolit existující Box/Section napojení bez obcházení Application tree.
- Potvrdit, že instalace může vydání klíče bezpečně odmítnout, pokud schází DB tabulky nebo HTTPS důvěra.

### REG-02: Lokální správa integrací ve WBengine

- Přidat chráněnou obrazovku v rámci tree a namespaců WBengine.
- Přidat vydání jednorázového klíče s popisem scope a seznamem aktivních/neaktivních integrací.
- Přidat odvolání a bezpečný postup rotace.
- Přidat výpis integrací a `last_used_at` (framework je dnes nemá) a čerstvé potvrzení hesla nad `User/Password.php`.
- Ověřit ADMIN/non-ADMIN, odhlášení, CSRF, jednorázové zobrazení, hash-only storage, audit rollback a zákaz cache/logování.
- Přidat instalační předběžnou kontrolu s návodem pro chybějící migrace/config; nevykonávat DDL automaticky při HTTP requestu.

### REG-03: Uživatelská registrace ve WBengine Adminu

- Nahradit text „Registraci webu ... spravuje CLI“ ovládacím prvkem „Přidat web“ pouze pro global admin.
- Vytvořit formulář pro jméno, HTTPS URL a integrační klíč; přidat validaci, stav ověřování a bezpečné chyby.
- Před uložením ověřit capability a identity přes současný SSRF-safe klient.
- Atomicky registrovat web, zašifrovat klíč, uložit `integration_id` a audit. Grant se nevytváří.
- Přidat migraci `002` (unikátní normalizovaná URL, sloupec `integration_id`) a opravit migrační runner, který dnes dělí soubor přes `split(';')` a nezná evidenci aplikovaných migrací.
- Přidat akci „Vyměnit klíč": ověřit nový klíč před přepsáním, přepsat `key_cipher` v transakci s auditem.
- Omezit počet pokusů o ověření klíče a zpracovat HTTP 429.
- Oddělit registraci webu od správy dalších grantů. Nahradit ruční ID účtu výběrem účtu podle e-mailu.
- Zachovat CLI jako důvěryhodný provozní nástroj/obnovu, nikoli jako nutnou cestu běžného vlastníka webu.

### REG-04: Ověření napříč oběma systémy

- Unit a databázové scénáře pro vydání/revoke/rotaci WBengine klíčů a transakční hranice.
- HTTP scénáře pro přihlášení ADMIN, CSRF, MFA/session dle existujícího modelu, no-store a bezpečné chybové odpovědi.
- Admin scénáře pro validní/nevalidní klíč, scope, nedostupný web, timeout, špatný TLS, DNS rebinding, privátní IP, redirect, duplicitní URL a souběžnou registraci.
- Skutečný dvouwebový Docker pilot přes veřejně důvěryhodné HTTPS nebo test CA: vydat klíč na jednom webu, zaregistrovat jej přes Admin UI, ověřit capabilities a načíst povolený obsah. Ověřit, že jiný web ani účet bez grantu přístup nezíská. Pilot cílí na konkrétní vydanou verzi frameworku a pin v CI Adminu (dnes v4.0.0) se před ním aktualizuje.
- Na dev prostředí ověřit, že kontejner Adminu dosáhne veřejné IP téhož serveru (`www.wbengine.org`), jinak registrace vlastního skeletonu selže na DNS/SSRF politice.
- Proveďte jeden grafický browser průchod od přihlášení na místním WBengine webu až po zobrazený web v centrálním Adminu. Do testů nevkládat produkční klíč.

### REG-05: Dokumentace, nasazení a provoz

- Aktualizovat README a webové návody obou projektů: požadavky API v2, postup migrace, vydání klíče, registrace, chybová hlášení, rotace a odvolání.
- Odstranit tvrzení, že registrace webu vyžaduje CLI. Ponechat provozní CLI postup pro nouzovou správu.
- Připojit produkční web až po úspěšném pilotu a nasazení na dev prostředí. Vydání verze frameworku probíhá před pilotem (viz pořadí fází).
- Nasadit Admin UI bez změny existujících dat. Před registrací produkce ověřit zálohu Admin DB a zachovat současný prázdný/bezpečný stav.
- V každé fázi aktualizovat tento plán, vytvořit samostatný commit a push podle dosavadního postupu.

## Pořadí fází

1. REG-01: kontrakt a předběžná kontrola.
2. REG-02 (framework) a REG-03 (Admin) paralelně. Admin ověřuje přes `provision()` ve fixture, na UI frameworku nezávisí.
3. Vydání verze frameworku a aktualizace pinu v CI Adminu.
4. REG-04: ověření napříč oběma systémy a pilot.
5. REG-05: dokumentace, nasazení na dev prostředí, až poté produkce.

## Přijímací kritéria

- Běžný globální správce připojí nový WBengine web bez SSH, terminálu, přístupu k DB a podpory vývojáře.
- Žádný web se neobjeví v centrální roletce před úspěšným vydáním a ověřením klíče.
- Po úspěšné registraci je web ihned v seznamu globálního správce; žádné ruční zjišťování `user_id` ani grant pro něj není potřeba.
- Neplatný klíč, chybějící scope, chybný certifikát, nebezpečná URL nebo timeout nezanechají částečnou registraci ani grant.
- Raw klíč se na WBengine zobrazí jednou; WBengine ukládá hash a centrála šifrovanou hodnotu. Žádný klíč není v logu, URL, auditu, HTML po následném načtení ani chybové zprávě.
- Oprávnění vynucuje současně centrální roli, integrační scope, vzdálené capabilities a místní autentizaci při správě klíče.
- Vlastník umí klíč v UI bezpečně otočit nebo odvolat a ví, jak se vrátit z neúspěšné rotace.
- Dokumentace obou projektů odpovídá skutečnému ověřenému toku.

## Rizika a opatření

| Riziko | Opatření |
|---|---|
| Klíč unikne z HTML/logu nebo sdíleného počítače | Jednorázové zobrazení, no-store, POST, žádná URL/logging, jasné upozornění a okamžitá možnost revoke |
| Správce vytvoří příliš široký klíč | Přednastavený pojmenovaný scope profil s minimem pro zvolené funkce; žádný vlastní text scope |
| URL míří do interní sítě nebo se změní DNS | Znovu použít a nerozvolnit stávající pinned DNS/SSRF obranu při každém spojení |
| Registrace v Adminu selže po vydání klíče | Klíč zůstane aktivní, uživatel může bezpečně opakovat registraci se stejným klíčem; při podezření na únik jej odvolá a vydá nový. Centrála neuloží neověřený záznam |
| Rotace přeruší provoz | Vydat a ověřit nový klíč, přepnout centrální šifrované credentials, následně revoke starého |
| Přístup k registru je přiřazen nesprávnému účtu | Registrace jen pro MFA-authenticated global admina; granty ostatním účtům výběrem podle e-mailu |
| Chybné klíče zablokují Admin (limit 10 selhání za 300 s na IP) | Omezení počtu pokusů v registračním formuláři, zpracování HTTP 429 s `Retry-After` |
| Duplicitní registrace téhož webu | Migrace `002` s unikátním hashem normalizované URL |
| API v2 není na cíli připravené | Předběžná kontrola zobrazí konkrétní postup a registraci zastaví bez částečných změn |

## Aktuální stav

- [x] WBengine API v2 má lokální `Model::provision()`/`revoke()`, hash klíčů, scopes, audit a HTTPS identity/discovery.
- [x] WBengine Admin ukládá existující klíče šifrovaně, používá pinned HTTPS klient a má CLI `site-add`.
- [x] Admin zobrazuje stránku registru/grantů, ale novou registraci nabízí jen CLI.
- [ ] WBengine nemá uživatelskou obrazovku pro vydání/odvolání integračního klíče, výpis integrací, `last_used_at` ani čerstvé potvrzení hesla.
- [ ] WBengine whitelist scopes neobsahuje `analytics:read` (pouze v `plan-analytics.md`).
- [ ] Admin nemá webový formulář „Přidat web” s validací klíče před uložením, unikátní URL (migrace `002`) ani výměnu klíče.
- [ ] Přidělování grantů vyžaduje ručně zjištěné ID účtu.
- [ ] Návody nepopisují dokončitelný onboarding bez odborného provozního přístupu.

Tento plán je návrh k věcné kontrole. Implementace začne až po jeho schválení.
