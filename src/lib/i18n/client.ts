import { page } from '$app/state';
import { translate, intlLocale, type Translate } from './index.ts';

/** Layout data keys are prefixed `ui` because page data is merged over them and pages have their own `locale`.
 * Translator for components: reads the active catalog from the layout data, so it follows the language reactively. */
export const t: Translate = (key, params) => translate(page.data.uiLocale, page.data.uiMessages, key, params);

/** Locale tag for Intl formatting in components. */
export const intl = () => intlLocale(page.data.uiLocale);
