import type { Session } from './lib/server/auth';
declare global {
    namespace App {
        interface Locals {
            session: Session | null;
            csrf: string;
        }
    }
}
export {};
