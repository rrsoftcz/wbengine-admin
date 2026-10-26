# Plán WBengine Admin

Samostatná centrální SvelteKit administrace více WBengine 4.0 webů přes API v2. Obsah zůstává na webech, integrační klíče výhradně na serveru centrály. PHP jádro zachovává strom Application/Site/Section/Box.

- [x] ADM-01: projekt, MySQL, Docker, explicitní CLI migrace.
- [x] ADM-02: pozvánky, scrypt, TOTP, záložní kódy, obnova, sessions, CSRF, role po webech, souběhové regrese.
- [x] ADM-03: registr, šifrované klíče, CLI provisioning, HTTPS klient s pinned DNS a celkovým deadline, discovery.
- [ ] ADM-04: obsahový editor, struktura, překlady, registrované boxy, obrázky.
- [ ] ADM-05: soukromé náhledy, koncepty, publikace, revize, konflikty, obnova struktury.
- [ ] REL-01: izolovaný pilot se skutečným PHP API, celkové review, CI, migrační a rollback postup.

## Postup

Po každé fázi testy, aktualizace plánu, commit a push do pracovní větve. Žádné klíče či provozní údaje v Gitu. Každé serverové volání kontroluje aktuální session, oprávnění a konečný allowlist operací. Browser dostává jen veřejné DTO. Bez automatického merge a deploye.

## Kontrolní bod 2026-10-26

ADM-01/02/03 implementovány a nezávisle zkontrolovány. Review závodu loginu se změnou hesla/deaktivací a celkového deadline vyřešeno přes RED/GREEN regrese. Rodič ověřil 17 unit testů, 5 reálných MySQL scénářů včetně dvou souběhových, 1 HTTP scénář pro CSRF, secure cookies, MFA a rotaci. Svelte check 0 chyb/0 warnings a produkční build prošly. Vlastní dočasný Compose projekt odstraněn.

Další krok ADM-04/05 podle Api/V2.php, Resources, ContentModel, ImageModel pracovního jádra. Konfigurace a provozní hranice v README.md. Major verze je rozpracovaná.
