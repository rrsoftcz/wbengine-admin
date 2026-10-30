import en from './en/index.ts';
import cs from './cs/index.ts';
import de from './de/index.ts';
import pl from './pl/index.ts';

/** UI languages of the central administration. English is the source catalog and the fallback. */
export const locales = ['en', 'cs', 'de', 'pl'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const localeNames: Record<Locale, string> = { en: 'English', cs: 'Čeština', de: 'Deutsch', pl: 'Polski' };
export const localeCookie = 'wb_locale';

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type StripPlural<K extends string> = K extends `${infer Base}.${PluralSuffix}` ? Base : K;
/** Every message key; plural variants (`key.one`, `key.other`) are addressed by the base key. */
export type MessageKey = StripPlural<keyof typeof en & string>;
export type Messages = Record<string, string>;
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

/** The catalogs as authored, without the English fallback (used by the parity test). */
export const catalogs: Record<Locale, Messages> = { en, cs, de, pl };

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Picks the best supported language from an Accept-Language header, or null. */
export function negotiate(header: string | null | undefined): Locale | null {
    if (!header) return null;
    const wanted = header.split(',').map((part) => {
        const [tag, ...rest] = part.trim().split(';');
        const q = rest.map((r) => r.trim()).find((r) => r.startsWith('q='));
        return { base: tag.toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) : 1 };
    }).filter((w) => w.base && Number.isFinite(w.q) && w.q > 0).sort((a, b) => b.q - a.q);
    for (const w of wanted) if (isLocale(w.base)) return w.base;
    return null;
}

/** The catalog for a language: English entries underneath, so a missing key never shows a raw identifier. */
export function messagesFor(locale: Locale): Messages {
    return locale === 'en' ? en : { ...en, ...catalogs[locale] };
}

function fill(template: string, params?: Params): string {
    return params ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template;
}

/** Looks a key up (with plural variants chosen by `count`) and fills `{name}` placeholders. */
export function translate(locale: Locale, messages: Messages, key: string, params?: Params): string {
    if (params && typeof params.count === 'number') {
        const category = new Intl.PluralRules(locale).select(params.count);
        const plural = messages[`${key}.${category}`] ?? messages[`${key}.other`];
        if (plural !== undefined) return fill(plural, params);
    }
    return fill(messages[key] ?? en[key as keyof typeof en] ?? key, params);
}

/** A translator bound to one language, for server code. */
export function translator(locale: Locale): Translate {
    const messages = messagesFor(locale);
    return (key, params) => translate(locale, messages, key, params);
}

export function intlLocale(locale: Locale): string {
    return { en: 'en-GB', cs: 'cs-CZ', de: 'de-DE', pl: 'pl-PL' }[locale];
}
