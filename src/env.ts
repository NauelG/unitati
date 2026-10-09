import { building, dev } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { parseAppEnvironment } from '#lib/environment.js';

/**
 * Required to run the app, optional to build it: `vite build` analyses the app
 * without opening a connection or signing a cookie, so a build must not need
 * credentials. Omitting `schema` entirely would make a value mandatory at build
 * time too.
 */
const requiredAtRuntime = (name: string) => (value: string | undefined) => {
	if (!value && !building) throw new Error(`${name} is not set`);
	return value ?? '';
};

export const variables = defineEnvVars({
	APP_ENV: {
		description:
			'Where this build runs: development, staging or production. Everything but production shows an environment badge and exposes the component gallery. Unset means development under `vite dev` and production otherwise, so a host that forgets it is treated as production.',
		// Public so the shell can render the badge without a `load`; not static so one build
		// serves every environment (ADR 0012).
		public: true,
		schema: (value) => parseAppEnvironment(value, dev ? 'development' : 'production')
	},
	DATABASE_URL: {
		description: 'The database connection string.',
		schema: requiredAtRuntime('DATABASE_URL')
	},
	BETTER_AUTH_SECRET: {
		description: 'Secret used to sign session cookies and tokens.',
		schema: requiredAtRuntime('BETTER_AUTH_SECRET')
	},
	BETTER_AUTH_URL: {
		description: 'Public origin of this installation, e.g. https://unitati.example.com.',
		schema: (value) => value ?? 'http://localhost:5173'
	},
	UPLOADS_DIR: {
		description:
			'Directory where ticket attachments are stored. Keep it outside the release directory, or every deploy loses the files.',
		schema: (value) => value || './uploads'
	},
	SMTP_HOST: {
		description:
			'SMTP server for outbound mail. Unset disables mail: answering a ticket still works, nobody is notified (ADR 0006).',
		schema: (value) => value ?? ''
	},
	SMTP_PORT: {
		description: 'SMTP port. Defaults to 587.',
		schema: (value) => value || '587'
	},
	SMTP_SECURE: {
		description: 'Set to "true" to use TLS from the first byte (usually port 465).',
		schema: (value) => value ?? ''
	},
	SMTP_USER: {
		description: 'SMTP username, if the server requires authentication.',
		schema: (value) => value ?? ''
	},
	SMTP_PASSWORD: {
		description: 'SMTP password, if the server requires authentication.',
		schema: (value) => value ?? ''
	},
	MAIL_FROM: {
		description: 'Sender address of outbound mail, e.g. "Unitati <desk@example.com>".',
		schema: (value) => value || 'Unitati <no-reply@localhost>'
	}
});
