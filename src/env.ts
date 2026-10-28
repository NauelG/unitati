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

/** `Intl` is the authority on IANA names: it throws a RangeError for an unknown zone. */
function isTimeZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** An absent OIDC variable is an empty string, so the three can be compared without `undefined`. */
const oidcVariable =
	(name: string, validate?: (value: string) => void) => (value: string | undefined) => {
		const trimmed = value?.trim() ?? '';
		if (trimmed && validate) validate(trimmed);
		return trimmed;
	};

function assertHttpUrl(name: string) {
	return (value: string) => {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			throw new Error(`${name} is not a URL: ${value}`);
		}
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			throw new Error(`${name} must be an http(s) URL: ${value}`);
		}
	};
}

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
	},
	OIDC_ISSUER: {
		description:
			"Issuer URL of the organisation's OpenID Connect identity provider, e.g. https://authentik.example.com/application/o/unitati/. Set together with OIDC_CLIENT_ID and OIDC_CLIENT_SECRET to turn single sign-on on; with none of the three set, nothing about SSO is visible (ADR 0056).",
		schema: oidcVariable('OIDC_ISSUER', assertHttpUrl('OIDC_ISSUER'))
	},
	OIDC_CLIENT_ID: {
		description:
			'Client id of this installation at the identity provider. All-or-none with OIDC_ISSUER and OIDC_CLIENT_SECRET.',
		schema: oidcVariable('OIDC_CLIENT_ID')
	},
	OIDC_CLIENT_SECRET: {
		description:
			'Client secret of this installation at the identity provider. Only ever read from the environment: it is never stored in the database.',
		schema: oidcVariable('OIDC_CLIENT_SECRET')
	},
	ORGANISATION_TIME_ZONE: {
		description:
			'IANA time zone the organisation works in, e.g. Europe/Madrid. A signed handover document states its decision time in this zone and in UTC. Defaults to Europe/Madrid.',
		schema: (value) => {
			const zone = value || 'Europe/Madrid';
			if (!isTimeZone(zone)) throw new Error(`ORGANISATION_TIME_ZONE is not a time zone: ${zone}`);
			return zone;
		}
	}
});
