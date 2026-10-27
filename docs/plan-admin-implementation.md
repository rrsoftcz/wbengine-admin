# Plán WBengine Admin

Samostatná centrální SvelteKit administrace více WBengine 4 webů přes API v2. Obsah zůstává na webech, integrační klíče výhradně na serveru centrály. PHP jádro zachovává strom Application/Site/Section/Box. Aktuální vydání administrace je `v0.2.0`; repo zůstává soukromé.

- [x] ADM-01: projekt, MySQL, Docker, explicitní CLI migrace.
- [x] ADM-02: pozvánky, scrypt, TOTP, záložní kódy, obnova, sessions, CSRF, role po webech, souběhové regrese.
- [x] ADM-03: registr, šifrované klíče, CLI provisioning, HTTPS klient s pinned DNS a celkovým deadline, discovery.
- [x] ADM-04: obsahový editor, struktura, překlady, registrované boxy, obrázky.
- [x] ADM-05: soukromé náhledy, koncepty, publikace, revize, konflikty, obnova struktury.
- [x] REL-01: technická brána, merge do `main` a privátní GitHub Release `v0.1.0` dokončeny. Repozitář a administrace zůstávají soukromé; další distribuce bude řešena samostatně.

## Postup

Po každé fázi testy, aktualizace plánu, commit a push do pracovní větve. Žádné klíče či provozní údaje v Gitu. Každé serverové volání kontroluje aktuální session, oprávnění a konečný allowlist operací. Browser dostává jen veřejné DTO. Bez automatického merge a deploye.

## Distribuce a kontrolní bod 2026-10-27

Rozhodnutí: administrace je samostatný nástroj v repozitáři `wbengine-admin`, ne součást PHP/Composer balíčku WBengine. Jádro zůstává malým PHP frameworkem; SvelteKit administrace běží jako samostatná Node/Docker služba s vlastní MySQL databází a připojuje se k více webům přes jejich API v2. Repozitář zůstává privátní. Framework, administrace a případné Docker obrazy mají nezávislé verze. První privátní zdrojové vydání má tag `v0.1.0`; veřejné zveřejnění a publikace obrazu nebyly schváleny.

Lokální checkout je v `/Users/roza/Sites/svelte/wbengine-admin`. Větev `codex/wbengine-4.0` byla rychlým posunem sloučena do `main` na commitu `7eb0870` a finální sada byla ověřena: `npm test` 34/34, `npm run check` 0 chyb a 0 varování, produkční build úspěšný, `npm run test:mysql` 5 databázových a 1 HTTP/MFA test zelený. Dřívější CI run 40360443062 obsahuje dvouwebový HTTPS API pilot, odvolání klíče, výpadek a obnovu databáze. Produkční API ani data nebyly testovány zápisovými požadavky.

PR #1 byl následně sloučen do `main`; Git remote potvrdil merge commit `a74892a`. Privátní GitHub Release `v0.1.0` byl vytvořen a ověřen příkazy `gh release list` a `gh release view`. Release odkazuje na tag `v0.1.0` a commit `7eb0870`. Repozitář i administrace zůstávají soukromé; kontejner nebyl publikován.

## Kontrolní bod 2026-10-26

ADM-01/02/03 implementovány a nezávisle zkontrolovány. Review závodu loginu se změnou hesla/deaktivací a celkového deadline vyřešeno přes RED/GREEN regrese. Rodič ověřil 17 unit testů, 5 reálných MySQL scénářů včetně dvou souběhových, 1 HTTP scénář pro CSRF, secure cookies, MFA a rotaci. Svelte check 0 chyb/0 warnings a produkční build prošly. Vlastní dočasný Compose projekt odstraněn.

Další krok ADM-04/05 podle Api/V2.php, Resources, ContentModel, ImageModel pracovního jádra. Konfigurace a provozní hranice v README.md. Major verze je rozpracovaná.


## ADM-04/05 kontrolní bod 2026-10-26

Serverový finite ApiClient/ContentGateway a UI výběru webu, stránkované kolekce/detail/create, editace struktury a článků, překlady, obrázky, draft/preview/publish/revisions a strukturální obnova. Každá operace kontroluje centrální roli, API scope a discovery capability. Integrační klíče zůstávají na serveru; cizí endpoint je konečný plán operací. Preview má iframe sandbox a CSP bez skriptů/externích médií.

Konflikt412 nevyvolá automatický retry, zachová přesné dirty texty a starý ETag. Explicitní merge pouze načte aktuální stav/ETag, vlastní zápis až po následné kontrole. Recovery struktury používá vlastní changes ETag. Upload limit1MiB JSON pro512KiB raster, veřejný charakter médií je v UI uveden.

Review našlo použití required JSON klíčů jako nonempty HTML required, které blokovalo platné prázdné článkové texty a partial translations. Skutečně kompilovaný SSR komponentový test nejprve3RED, po opravě4GREEN. Opravu nezávislé scoped review přijalo. Server stále posílá požadované JSON klíče; link/key/type mají vlastní významové kontroly.

Rodič ověřil33unit/transport/action/component testů, Sveltecheck0chyb/0warnings, produkční build a Node24 Dockerimage. Před opravou UI také5realMySQL+1authHTTPgreen, oprava mění pouze HTML constraints. Po opravě skutečný centralHTML->ověřené pinnedHTTPS->PHPAPI pilot1/1GREEN:login/MFA, createpage/article, translation/privatepreview, concurrent412 a preservedtextarea, explicitmerge, save/publish/revisionrestore, strukturálnídelete/undo včetněpřekladu, menu/section/boxCRUD, imageCRUD, editorpublish403 a cizíweb403. ZákladníTLSproviderprobe2/2GREEN včetně odmítnutí bezexplicitníCA.

Pilot používá Nodefetch na skutečné SSR formuláře, nejde o grafickou Chromium automatizaci. Finální releasegate rozšiřuje ověření na dvě skutečně oddělené API databáze/klíče, revokaci a výpadky. Zatím bez merge/tag/deploymentu. Následuje commit/push této fáze a CI.


## REL-01, dva skutečně oddělené weby a výpadky

2026-10-26: rodič ověřil34unit/transport/action/SSRcomponent testů, check0/0 a poslední produkčníDockerbuild. Skutečný dualwebHTMLpilot1/1GREEN (~14.05s) přes wrapper v jádru: dva samostatné DB/user/key weby, crosskey401, editorweb1 odmítnutý naweb2, výpadekweb2 při běžícímweb1, zachovanýdirtytext a původníETag, návrat bezautomatickéhozápisu a teprve ručníretry, odvolanýklíč401bezvlivu naweb1. PoSIGKILL procesu centrály oba veřejnéweby dále200.

Pilot odhalil skutečnou chybu: nový PageServerLoad při deadAPI překryl actionfail. Request-local fallback teď uchovává jen lokálněautorizované siteID/name/roli a odeslanéstringfields, nikdyklíče/gateway/exception. Funguje jen pro stejný POST a route. NásledujícíPOST opět provede fresh session/grants/CSRF/scopes/capabilities/ETag. Nezávislé scoped review bez blokací, actualRED/GREEN a nový unit test.

Providerprobe3/3GREEN, DBdump/restore17tabulek/861řádků: stejnédefaulty/definice/hashe všechřádků, pomocnáDB/dump odstraněné. Vše jen izolovanétesty. Nový samostatný CIjob stahuje veřejnouframeworkovou větev, sestaví obrazy, spustí start/probe/consumer/backup-check a vždyreset. Runtime není vGitu a žádnýklíč se netiskne.

Implementace i technická brána jsou hotové; zbývá ověření této novéCI a závěrečné rozhodnutí o merge/tag/release4.0.0. Produkčnídata ani deployment nebyly provedeny. Společný aktuální stav vede také plan-framework-improvements.md ve frameworkovém repo.


## Finální remote ověření

Administrace287274d: oba GitHub joby GREEN v run40360443062, včetně skutečného Two-sitePHPAPIpilot2m18s s výpadkem/revokací a dump/restore. Jádro0c15eba má všech7jobůGREEN; poslední dokumentačnícheckpointd99d088 a aktuální proof ve společnémplánu. Skeleton95ce7cf má navíc actualsourceHTMLmigrační smoke18plánů naTEMPkopiích,8safeapply/rollback a10manualreview bezpřepsání originálů.

Implementace a technické testy jsou dokončené, framework v4.0.0 je vydán, zbývá merge administrace a zveřejnění jejího repozitáře. Merge administrace ještě neproběhl;tagv4.0.0 jádra existuje;produkčnídeploy ani přepsání skutečných provozníchdat neproběhly. Podkladykvydání a operatorplaybook jsou ve frameworkovémrepo. Tento poslední commit pouze doplňuje finální stav plánu.


## Publikace

2026-10-27: Jádro WBengine bylo sloučeno do master jako cf710e5adbc25809868a864e615f8b9fc62a7489 a tag v4.0.0 je zveřejněn. CI integrační pilot používá stabilní tag, ne vývojovou větev. Administrace byla sloučena do `main` a soukromé vydání v0.1.0 je publikováno. Produkční nasazení nebylo provedeno.

## Analytika a testovací stav 2026-10-28

Tento bod nahrazuje dřívější stavové poznámky o nedokončeném propojení Adminu s webem. WBengine Admin `v0.2.0` obsahuje dashboard `/analytics/{id}`. Přístup kontroluje současně centrální grant, scope `analytics:read` a vzdálenou capability `analytics.read`. CI ověřila analytický transport a soukromý dvouwebový API pilot; poslední lokální sada Adminu měla 43 testů, Svelte check bez chyb a varování a produkční build úspěšný.

Lokální Docker instance Adminu běží pouze na loopbacku vývojového počítače. Lokální HTTPS proxy na `https://localhost:13443` vrací přesměrování na přihlášení a formulář přihlášení HTTP 200. První účet vzniká jednorázovou pozvánkou mimo Git; před použitím se nastaví heslo a povinné MFA. Způsob předání pozvánky ani tajemství nepatří do repozitáře.

WBengine.org je v registru připojen jako read-only web. Pinned HTTPS klient ověřil capability, identitu a čtení kolekce článků. Integrační klíč obsahuje pouze čtecí oprávnění, včetně `analytics:read`, bez write scope. Veřejný web ale nyní hlásí `analytics.read=false`, protože nativní sběr zůstává vypnutý; dashboard proto správně ukazuje nedostupnost analytiky pro tento web. Google Analytics zůstává aktivní. Zapnutí nativního sběru a následné provozní porovnání s GA4 jsou samostatný krok, který se provede až po ověření aktualizovaného oznámení o soukromí a výslovném rozhodnutí provozovatele.

Nový VPS má v aktivním nastavení přesnou trusted proxy `172.18.0.1/32` a hlavičky `x-forwarded-for` a `x-forwarded-proto`; po restartu web kontejneru prošla API identita přes HTTPS. Původní `docker.rrsoft.cz` nebyl upravován. Přístup přes alias `docker-rrsoft` se dříve ověřil jako uživatel `roza`; při posledním opakování selhal DNS překlad ještě před SSH autentizací.

Zbývající uživatelský test: přijmout lokální jednorázovou pozvánku, přihlásit se s MFA, ověřit seznam webů a read-only obsah. Analytický dashboard lze ověřit plně v izolovaném dvouwebovém pilotu; na produkčním webu zůstane nedostupný, dokud nativní sběr nebude samostatně zapnut.
