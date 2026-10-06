import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'The database connection string.',
		// Required to run the app, optional to build it: `vite build` analyses the
		// app without ever opening a connection, so a build must not need database
		// credentials (CI and image builds have none). Omitting `schema` entirely
		// would make the value mandatory at build time too.
		schema: (value) => {
			if (!value && !building) throw new Error('DATABASE_URL is not set');
			return value ?? '';
		}
	}
});
