import { can } from '../access/permissions';
import type { ApiAuthState } from './authenticate-request';
import { APP_VERSION } from '../../version';
import { ENDPOINTS } from './endpoints';
import type { ApiPrincipal } from './keys';
import { buildOpenApiDocument } from './openapi';
import { rateLimit } from './rate-limit';
import { ApiError, matchPath, Reply, resolveRefusal, type Endpoint } from './registry';

/**
 * The HTTP plumbing behind `src/routes/api/v1/[...path]/+server.ts`: one
 * function that turns a request into a response, so the route stays an adapter
 * and every error shares one envelope (ADR 0022).
 */

const PREFIX = '/api/v1';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
	});
}

function problem(
	status: number,
	code: string,
	message: string,
	extra: { issues?: unknown; details?: unknown; headers?: Record<string, string> } = {}
): Response {
	return json(
		status,
		{
			error: {
				code,
				message,
				...(extra.issues === undefined ? {} : { issues: extra.issues }),
				...(extra.details === undefined ? {} : { details: extra.details })
			}
		},
		extra.headers
	);
}

export interface ApiEvent {
	request: Request;
	locals: App.Locals;
}

/** Query string, then JSON body, then path parameters: the last one cannot be overridden by the caller. */
async function inputOf(
	request: Request,
	url: URL,
	params: Record<string, string>
): Promise<unknown> {
	const query = Object.fromEntries(url.searchParams);

	let body: Record<string, unknown> = {};
	if (request.method !== 'GET' && request.headers.get('content-type')?.includes('json')) {
		const parsed: unknown = await request.json().catch(() => undefined);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new ApiError(400, 'invalid_json', 'The request body is not a JSON object.');
		}
		body = parsed as Record<string, unknown>;
	}

	return { ...query, ...body, ...params };
}

function matchEndpoint(endpoints: readonly Endpoint[], method: string, pathname: string) {
	const relative = pathname.slice(PREFIX.length);
	for (const endpoint of endpoints) {
		if (endpoint.method !== method) continue;
		const params = matchPath(endpoint.path, relative);
		if (params) return { endpoint, params };
	}
	return null;
}

/** `endpoints` is a parameter so a spec can serve a declaration the registry does not have yet. */
export async function handleApiRequest(
	{ request, locals }: ApiEvent,
	endpoints: readonly Endpoint[] = ENDPOINTS
): Promise<Response> {
	const principal = locals.user as ApiPrincipal | null;
	const auth: ApiAuthState | undefined = locals.api;
	if (!principal || !auth?.ok) {
		return problem(401, 'unauthorized', 'A valid API key is required.', {
			headers: { 'www-authenticate': 'Bearer' }
		});
	}

	const decision = rateLimit(auth.keyId);
	if (!decision.allowed) {
		return problem(429, 'rate_limited', 'Too many requests.', {
			headers: { 'retry-after': String(decision.retryAfterSeconds) }
		});
	}

	const url = new URL(request.url);

	// The shape of the API grants nothing, so any valid key may read it, with no scope.
	// It describes every endpoint, not only those this key can call: one document per instance.
	if (request.method === 'GET' && url.pathname === `${PREFIX}/openapi.json`) {
		return json(
			200,
			buildOpenApiDocument(endpoints, { version: APP_VERSION, serverUrl: url.origin })
		);
	}

	const match = matchEndpoint(endpoints, request.method, url.pathname);
	// "Not allowed" and "not there" are the same answer (ADR 0007).
	if (!match || !match.endpoint.permissions.some((permission) => can(principal, permission))) {
		return problem(404, 'not_found', 'Not found.');
	}

	const { endpoint, params } = match;
	try {
		const input = endpoint.input.safeParse(await inputOf(request, url, params));
		if (!input.success) {
			return problem(400, 'invalid_input', 'The request is not valid.', {
				issues: input.error.issues
			});
		}

		const result = await endpoint.handler({
			principal,
			input: input.data,
			refuse: (failure) => resolveRefusal(endpoint.id, endpoint.refusalTable, failure)
		});
		const reply = result instanceof Reply ? result : new Reply(200, result);
		// Serialised through the schema, so a field it does not name never leaves.
		const body = endpoint.output.parse(reply.body);
		// A 204 has no body by definition; the schema (`z.null()`) still ran.
		if (reply.status === 204) {
			return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
		}
		return json(reply.status, body, reply.headers);
	} catch (error) {
		if (error instanceof ApiError) {
			return problem(error.status, error.code, error.message, {
				issues: error.issues,
				details: error.details
			});
		}
		console.error(`API endpoint ${endpoint.id} failed`, error);
		return problem(500, 'internal_error', 'Something went wrong.');
	}
}
