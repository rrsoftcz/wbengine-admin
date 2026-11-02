import nodemailer from 'nodemailer';
import type { Translate } from '../i18n/index.ts';

/** SMTP settings of the optional invitation mail. Absent configuration means the feature is off. */
export type MailConfig = { host: string; port: number; user: string; password: string; from: string };
/** Why a send failed, safe to show to the administrator (never contains the password or the token). */
export type MailReason = 'auth' | 'recipient' | 'connection' | 'timeout' | 'unknown';
export type MailResult = { ok: true } | { ok: false; reason: MailReason };
export type MailMessage = { to: string; subject: string; text: string };
/** The part of a nodemailer transport that is used, so tests can inject a fake. */
export type MailTransport = { sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>; close(): void };
export type TransportFactory = (config: MailConfig) => MailTransport;

const timeoutMs = 15000;
let warned = false;

/** Reads the configuration from the environment; null when the feature is off or only partly configured. */
export function mailConfig(env: Record<string, string | undefined> = process.env, warn: (message: string) => void = console.warn): MailConfig | null {
    const host = env.MAIL_SMTP_HOST?.trim() ?? '', user = env.MAIL_SMTP_USER?.trim() ?? '', from = env.MAIL_FROM?.trim() ?? '';
    let password = env.MAIL_SMTP_PASSWORD ?? '';
    // Google shows an app password in groups of four letters: the spaces are not part of it, so they are dropped for Google hosts only.
    if (/(^|\.)(gmail|googlemail)\.com$/i.test(host))
        password = password.replace(/\s+/g, '');
    const given = [host, user, password, from].filter(Boolean).length;
    if (given === 0)
        return null;
    const port = env.MAIL_SMTP_PORT?.trim() ? Number(env.MAIL_SMTP_PORT) : 587;
    if (given < 4 || !Number.isInteger(port) || port < 1 || port > 65535) {
        if (!warned) {
            warned = true;
            warn('Invitation mail is disabled: set MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASSWORD and MAIL_FROM together with a valid MAIL_SMTP_PORT.');
        }
        return null;
    }
    return { host, port, user, password, from };
}

/** Rejects header injection: control characters (CR, LF, NUL and the like) never belong in an address or a subject. */
export function assertSingleLine(value: string): string {
    if (/[\u0000-\u001f\u007f]/.test(value))
        throw Error('Invalid mail header value');
    return value;
}

function defaultTransport(config: MailConfig): MailTransport {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        requireTLS: config.port !== 465,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
    });
}

/** Maps an error of the transport to a short reason that exposes nothing secret. */
export function mailReason(error: unknown): MailReason {
    const e = error as { code?: string; responseCode?: number } | null;
    const code = e?.code ?? '';
    if (code === 'EAUTH' || e?.responseCode === 535 || e?.responseCode === 534)
        return 'auth';
    if (code === 'EENVELOPE' || (typeof e?.responseCode === 'number' && [550, 551, 552, 553, 554].includes(e.responseCode)))
        return 'recipient';
    if (code === 'ETIMEDOUT' || code === 'ESOCKET' && /timeout/i.test(String((error as Error).message)))
        return 'timeout';
    if (['ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETLS'].includes(code))
        return 'connection';
    return 'unknown';
}

/** Sends one message. Never throws: a failure is returned as a reason and logged without secrets. */
export async function sendMail(config: MailConfig, message: MailMessage, factory: TransportFactory = defaultTransport, log: (line: string) => void = console.error): Promise<MailResult> {
    let transport: MailTransport | undefined;
    try {
        const to = assertSingleLine(message.to), subject = assertSingleLine(message.subject);
        transport = factory(config);
        await Promise.race([
            transport.sendMail({ from: assertSingleLine(config.from), to, subject, text: message.text }),
            new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs * 2).unref())
        ]);
        return { ok: true };
    }
    catch (error) {
        const reason = mailReason(error);
        const e = error as { code?: string; responseCode?: number };
        log(`Invitation mail failed: reason=${reason} code=${e?.code ?? ''} response=${e?.responseCode ?? ''}`);
        return { ok: false, reason };
    }
    finally {
        try { transport?.close(); }
        catch { /* the transport is gone anyway */ }
    }
}

/** The welcome text with the link and the one-time token, in the language of the inviting administrator. */
export function invitationMessage(to: string, origin: string, token: string, t: Translate): MailMessage {
    const link = `${origin.replace(/\/+$/, '')}/accept`;
    const text = [t('mail.invite.hello'), '', t('mail.invite.intro'), '', t('mail.invite.link', { link }), '', t('mail.invite.code'), token, '', t('mail.invite.expires'), '', t('mail.invite.ignore'), ''].join('\n');
    return { to, subject: t('mail.invite.subject'), text };
}

/** Sends the invitation mail; the caller decides whether the feature is on (a non-null configuration). */
export function sendInvitationMail(config: MailConfig, to: string, origin: string, token: string, t: Translate, factory?: TransportFactory): Promise<MailResult> {
    return sendMail(config, invitationMessage(to, origin, token, t), factory);
}
