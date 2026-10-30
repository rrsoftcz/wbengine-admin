import { page } from '$app/state';
import { translate, intlLocale, type Translate } from './index.ts';

/** Translator for components: reads the active catalog from the layout data, so it follows the language reactively. */
export const t: Translate = (key, params) => translate(page.data.locale, page.data.messages, key, params);

/** Locale tag for Intl formatting in components. */
export const intl = () => intlLocale(page.data.locale);
