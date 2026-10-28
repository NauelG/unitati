import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { sso } from '@better-auth/sso';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$app/env/private';
import { OIDC_PROVIDER_ID, oidcDiscoveryUrl } from '../../oidc';
import { getDb, schema } from '../db';
import { oidcConfig } from './oidc';
import { ssoSessionExpiry } from './sessions';
import { passwordSignInRefused, resolveSsoUser } from './sso';

const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_SECONDS = 60 * 60 * 24;

/** Better Auth's own floor is 8; the product asks for a little more. */
export const MIN_PASSWORD_LENGTH = 10;

let instance: ReturnType<typeof create> | undefined;

/** The only SSO routes that stay open: starting the flow and the identity provider's callback. */
const SSO_OPEN_PATHS = ['/sign-in/sso', '/sso/callback'];

function create() {
	const oidc = oidcConfig();

	return betterAuth({
		secret: BETTER_AUTH_SECRET,
		baseURL: BETTER_AUTH_URL,
		database: drizzleAdapter(getDb(), {
			provider: 'pg',
			// `@better-auth/sso` resolves an identity inside Better Auth's own database
			// transaction and refuses to run without native ones.
			transaction: true,
			schema: {
				user: schema.users,
				session: schema.sessions,
				account: schema.authAccounts,
				verification: schema.verifications,
				ssoProvider: schema.ssoProviders
			}
		}),
		// Better Auth fetches the identity provider's discovery document and keys
		// only from origins it trusts.
		trustedOrigins: oidc ? [new URL(oidc.issuer).origin] : [],
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
			updateAge: SESSION_REFRESH_SECONDS,
			additionalFields: {
				// How the session was opened; set by the hook below, never by a request.
				authMethod: { type: 'string', defaultValue: 'password', input: false }
			}
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 20
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session, context) => {
						// The path says how this session is being opened. Only the identity
						// provider's callback opens an SSO session: twelve hours, never refreshed.
						if (context?.path?.startsWith('/sso/callback')) {
							return {
								data: {
									...session,
									authMethod: 'sso',
									expiresAt: ssoSessionExpiry(new Date())
								}
							};
						}
						// While SSO is required, a password session is for admins only. Refusing
						// here, not in a form action, is what closes Better Auth's own endpoint too.
						if (await passwordSignInRefused(session.userId)) return false;
					}
				},
				update: {
					before: async (data, context) => {
						// Better Auth pushes `expires_at` out as a session ages. An SSO session
						// keeps the date it was born with. The result is merged over `data`, so
						// the old date is written back rather than the key dropped.
						const current = context?.context.session?.session as
							{ authMethod?: string; expiresAt: Date } | undefined;
						if (current?.authMethod === 'sso' && 'expiresAt' in data) {
							return { data: { expiresAt: current.expiresAt } };
						}
					}
				}
			}
		},
		hooks: {
			before: createAuthMiddleware(async (context) => {
				// Provider registration and the rest of the plugin's management API are not
				// ours to offer: the provider comes from the environment and nowhere else.
				if (
					context.path.startsWith('/sso/') &&
					!SSO_OPEN_PATHS.some((path) => context.path.startsWith(path))
				) {
					throw new APIError('NOT_FOUND');
				}
			})
		},
		plugins: [
			sso({
				providersLimit: 0,
				resolveUser: async (input) => {
					// A configured provider, and ours: a provider registered any other way would
					// vouch for any email it likes.
					if (
						input.providerId !== OIDC_PROVIDER_ID ||
						input.providerReference.source.type !== 'configured'
					) {
						return { action: 'reject', code: 'sso_unavailable' };
					}
					return resolveSsoUser(input);
				},
				defaultSSO: oidc
					? [
							{
								providerId: OIDC_PROVIDER_ID,
								domain: new URL(oidc.issuer).host,
								oidcConfig: {
									issuer: oidc.issuer,
									pkce: true,
									clientId: oidc.clientId,
									clientSecret: oidc.clientSecret,
									discoveryEndpoint: oidcDiscoveryUrl(oidc.issuer),
									scopes: ['openid', 'email', 'profile']
								}
							}
						]
					: []
			})
		],
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
