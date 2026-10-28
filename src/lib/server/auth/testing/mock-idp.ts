import { createServer, type Server } from 'node:http';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';

/**
 * A just-enough OpenID Connect identity provider for the sign-in specs: a
 * discovery document, a key set and a token endpoint that hands back whichever
 * ID token the test queued. No authorize page: the spec skips the browser and
 * calls Unitati's callback with the `state` it was given.
 */

export const MOCK_IDP_PORT = 47531;
export const MOCK_IDP_ISSUER = `http://localhost:${MOCK_IDP_PORT}/`;
export const MOCK_IDP_CLIENT_ID = 'unitati-test';

const KEY_ID = 'mock-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export interface IdTokenClaims {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	[claim: string]: unknown;
}

function signIdToken(claims: IdTokenClaims): string {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }));
	const payload = base64url(
		JSON.stringify({
			iss: MOCK_IDP_ISSUER,
			aud: MOCK_IDP_CLIENT_ID,
			iat: now,
			exp: now + 300,
			...claims
		})
	);
	const signature = createSign('RSA-SHA256')
		.update(`${header}.${payload}`)
		.sign(createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' })));
	return `${header}.${payload}.${base64url(signature)}`;
}

export interface MockIdp {
	/** The claims the next token exchange returns. */
	issue(claims: IdTokenClaims): void;
	close(): Promise<void>;
}

export async function startMockIdp(): Promise<MockIdp> {
	let next: IdTokenClaims | null = null;

	const server: Server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', MOCK_IDP_ISSUER);
		const json = (body: unknown) => {
			response.setHeader('content-type', 'application/json');
			response.end(JSON.stringify(body));
		};

		if (url.pathname === '/.well-known/openid-configuration') {
			return json({
				issuer: MOCK_IDP_ISSUER,
				authorization_endpoint: `${MOCK_IDP_ISSUER}authorize`,
				token_endpoint: `${MOCK_IDP_ISSUER}token`,
				jwks_uri: `${MOCK_IDP_ISSUER}jwks`,
				response_types_supported: ['code'],
				subject_types_supported: ['public'],
				id_token_signing_alg_values_supported: ['RS256'],
				token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post']
			});
		}
		if (url.pathname === '/jwks') {
			return json({
				keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KEY_ID, alg: 'RS256', use: 'sig' }]
			});
		}
		if (url.pathname === '/token' && request.method === 'POST') {
			request.resume();
			if (!next) {
				response.statusCode = 400;
				return json({ error: 'no_token_queued' });
			}
			return json({
				access_token: 'mock-access-token',
				token_type: 'Bearer',
				expires_in: 300,
				id_token: signIdToken(next)
			});
		}
		response.statusCode = 404;
		response.end();
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(MOCK_IDP_PORT, resolve);
	});

	return {
		issue(claims) {
			next = claims;
		},
		close: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
