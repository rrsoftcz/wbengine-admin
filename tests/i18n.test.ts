import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/lib/i18n/en/index.ts';
import { locales, catalogs, negotiate, translate, isLocale, type Locale } from '../src/lib/i18n/index.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('negotiate picks the best supported language by quality and ignores the rest', () => {
    assert.equal(negotiate('de-DE,de;q=0.9,en;q=0.8'), 'de');
    assert.equal(negotiate('fr-FR,pl;q=0.7,en;q=0.5'), 'pl');
    assert.equal(negotiate('cs'), 'cs');
    assert.equal(negotiate('fr,ja;q=0.5'), null);
    assert.equal(negotiate('de;q=0,cs;q=0.1'), 'cs');
    assert.equal(negotiate(null), null);
    assert.equal(negotiate('*'), null);
});

test('isLocale accepts exactly the supported languages', () => {
    for (const l of locales) assert.ok(isLocale(l));
    assert.equal(isLocale('fr'), false);
    assert.equal(isLocale(undefined), false);
});

test('translate fills placeholders, falls back to English and then to the key', () => {
    const messages = { 'a.greet': 'Hello {name}', 'a.count.one': '{count} item', 'a.count.other': '{count} items' };
    assert.equal(translate('en', messages, 'a.greet', { name: 'Ann' }), 'Hello Ann');
    assert.equal(translate('en', messages, 'a.greet'), 'Hello {name}');
    assert.equal(translate('en', messages, 'a.count', { count: 1 }), '1 item');
    assert.equal(translate('en', messages, 'a.count', { count: 3 }), '3 items');
    assert.equal(translate('en', messages, 'unknown.key'), 'unknown.key');
});

test('plural categories follow the language rules', () => {
    const pl = { 'n.one': '{count} plik', 'n.few': '{count} pliki', 'n.many': '{count} plikow', 'n.other': '{count} pliku' };
    assert.equal(translate('pl', pl, 'n', { count: 1 }), '1 plik');
    assert.equal(translate('pl', pl, 'n', { count: 3 }), '3 pliki');
    assert.equal(translate('pl', pl, 'n', { count: 5 }), '5 plikow');
});

test('every translation uses only keys of the English catalog, with the same placeholders and no empty text', () => {
    for (const locale of locales) {
        if (locale === 'en') continue;
        for (const [key, text] of Object.entries(catalogs[locale])) {
            // A language may need plural categories English lacks (few, many) for keys that are plurals in English.
            const source = key in en ? key : key.replace(/\.(zero|two|few|many)$/, '.other');
            assert.ok(source in en, `${locale}: unknown key ${key}`);
            assert.notEqual(text.trim(), '', `${locale}: empty text for ${key}`);
            assert.equal(placeholders(text), placeholders((en as Record<string, string>)[source]), `${locale}: placeholders differ for ${key}`);
        }
    }
});

test('a language that declares itself complete has every English key', () => {
    // A language is listed here once its catalog is finished; others would fall back to English per key.
    const complete: Locale[] = ['cs', 'de', 'pl'];
    for (const locale of complete) assert.deepEqual(Object.keys(en).filter((k) => !(k in catalogs[locale])), [], `${locale} is missing keys`);
});
