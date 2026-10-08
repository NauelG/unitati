/**
 * Where this build is running. See docs/adr/0012-environments-and-real-verification.md.
 *
 * `NODE_ENV` cannot tell the environments apart: staging runs the production build, so it reads
 * `production` there too. One artefact serves every environment, which makes the answer a runtime
 * variable (`APP_ENV`), never something baked into the build.
 */
export const APP_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * Reads `APP_ENV`. An unset value falls back to `fallback`; a value outside the vocabulary throws,
 * so a typo such as `prod` stops the server at start instead of quietly picking an environment.
 */
export function parseAppEnvironment(
	value: string | undefined,
	fallback: AppEnvironment
): AppEnvironment {
	if (value === undefined || value === '') return fallback;
	const match = APP_ENVIRONMENTS.find((environment) => environment === value);
	if (!match) {
		throw new Error(`APP_ENV must be one of ${APP_ENVIRONMENTS.join(', ')}, got "${value}"`);
	}
	return match;
}

/** Everything that is not production is a place where nobody's real work lives. */
export function isProduction(environment: AppEnvironment): boolean {
	return environment === 'production';
}
