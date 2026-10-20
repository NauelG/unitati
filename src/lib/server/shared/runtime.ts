import {
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
