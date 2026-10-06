import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

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
	}
});
