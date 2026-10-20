import {
	BETTER_AUTH_URL,
	MAIL_FROM,
	SMTP_HOST,
	SMTP_PASSWORD,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER,
	UPLOADS_DIR
} from '$app/env/private';
import { smtpMailer, type Mailer } from './mail';
import { LocalStorage, type Storage } from './storage';

/**
 * The only file of the domain that reads the environment, so everything else
 * takes its collaborators as arguments and stays testable without one. The
 * domain functions default to these; the specs pass an in-memory storage and a
 * fake mailer.
 */

let storage: Storage | undefined;
let mailer: Mailer | null | undefined;

export function runtimeStorage(): Storage {
	return (storage ??= new LocalStorage(UPLOADS_DIR));
}

export function runtimeMailer(): Mailer | null {
	if (mailer === undefined) {
		mailer = smtpMailer({
			host: SMTP_HOST,
			port: Number(SMTP_PORT),
			secure: SMTP_SECURE === 'true',
			user: SMTP_USER,
			password: SMTP_PASSWORD,
			from: MAIL_FROM
		});
	}
	return mailer;
}

/**
 * Tests only: what `runtimeStorage` and `runtimeMailer` hand out until the next
 * `resetRuntime()`. For a route spec, whose handler cannot take collaborators as
 * arguments. A `vi.mock` of this file is not enough there: the db project shares
 * one module graph (ADR 0032), so a domain module imported by an earlier file
 * keeps the real one.
 */
export function overrideRuntime(next: { storage?: Storage; mailer?: Mailer | null }): void {
	if (next.storage) storage = next.storage;
	if (next.mailer !== undefined) mailer = next.mailer;
}

/** Tests only; the database harness calls it before every test. */
export function resetRuntime(): void {
	storage = undefined;
	mailer = undefined;
}

/** The public origin of this installation, for links that leave the app (a mailed signing link). */
export function runtimeOrigin(): string {
	return BETTER_AUTH_URL.replace(/\/+$/, '');
}
