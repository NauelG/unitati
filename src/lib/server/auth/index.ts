import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$app/env/private';
import { getDb, schema } from '../db';

const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_SECONDS = 60 * 60 * 24;

/** Better Auth's own floor is 8; the product asks for a little more. */
export const MIN_PASSWORD_LENGTH = 10;

let instance: ReturnType<typeof create> | undefined;

function create() {
	return betterAuth({
		secret: BETTER_AUTH_SECRET,
		baseURL: BETTER_AUTH_URL,
		database: drizzleAdapter(getDb(), {
			provider: 'pg',
			schema: {
				user: schema.users,
				session: schema.sessions,
				account: schema.authAccounts,
				verification: schema.verifications
			}
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			// No open sign-up: accounts are provisioned by an admin, and the very
			// first one by the setup screen (ADR 0006). Better Auth still needs the
			// endpoint enabled for its own sign-up API, which the setup flow calls.
			autoSignIn: true
		},
		session: {
			expiresIn: SESSION_EXPIRY_SECONDS,
			updateAge: SESSION_REFRESH_SECONDS
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 20
		},
		user: {
			additionalFields: {
				// Assigned by the product, never accepted from a request body.
				role: { type: 'string', defaultValue: 'employee', input: false }
			}
		},
		advanced: {
			ipAddress: {
				ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for']
			}
		}
	});
}

/**
 * Resolved on first use: building the app must not construct a database client
 * (see `src/env.ts`).
 */
export function getAuth() {
	return (instance ??= create());
}
