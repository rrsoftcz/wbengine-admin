import type {ContentFormFailure} from './lib/server/content';
import type { Session } from './lib/server/auth';
import type { Locale, Messages, Translate } from './lib/i18n/index';
declare global {
    namespace App {
        interface Locals {
            session: Session | null;
            csrf: string;
            contentFailure?: ContentFormFailure;
            locale: Locale;
            messages: Messages;
            t: Translate;
        }
    }
}
export {};
