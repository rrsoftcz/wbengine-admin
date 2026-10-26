import type {ContentFormFailure} from './lib/server/content';
import type { Session } from './lib/server/auth';
declare global {
    namespace App {
        interface Locals {
            session: Session | null;
            csrf: string;
            contentFailure?: ContentFormFailure;
        }
    }
}
export {};
