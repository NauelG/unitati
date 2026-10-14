import { can } from '../access/permissions';
import type { ApiAuthState } from './authenticate-request';
import { ENDPOINTS } from './endpoints';
import type { ApiPrincipal } from './keys';
import { rateLimit } from './rate-limit';
import { ApiError, matchPath, type Endpoint } from './registry';

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
	extra: { issues?: unknown; headers?: Record<string, string> } = {}
): Response {
	return json(
		status,
		{ error: { code, message, ...(extra.issues === undefined ? {} : { issues: extra.issues }) } },
		extra.headers
	);
}

export interface ApiEvent {
	request: Request;
	locals: App.Locals;
}

/** Query string, then JSON body, then path parameters: the last one cannot be overridden by the caller. */
async function inputOf(request: Request, params: Record<string, string>): Promise<unknown> {
	const query = Object.fromEntries(new URL(request.url).searchParams);

	let body: Record<string, unknown> = {};
	if (request.method !== 'GET' && request.headers.get('content-type')?.includes('json')) {
		const parsed: unknown = await request.json().catch(() => undefined);
		if (
			parsed === undefined ||
			parsed === null ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed)
		) {
			throw new ApiError(400, 'invalid_json', 'The request body is not a JSON object.');
		}
		body = parsed as Record<string, unknown>;
	}

	return { ...query, ...body, ...params };
}

function find(method: string, pathname: string) {
	const relative = pathname.slice(PREFIX.length);
	for (const endpoint of ENDPOINTS) {
		if (endpoint.method !== method) continue;
		const params = matchPath(endpoint.path, relative);
		if (params) return { endpoint, params };
	}
	return null;
}

export async function handleApiRequest({ request, locals }: ApiEvent): Promise<Response> {
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

	const match = find(request.method, new URL(request.url).pathname);
	// "Not allowed" and "not there" are the same answer (ADR 0007).
	if (!match || !match.endpoint.permissions.some((permission) => can(principal, permission))) {
		return problem(404, 'not_found', 'Not found.');
	}

	return run(match.endpoint, match.params, principal, request);
}

async function run(
	endpoint: Endpoint,
	params: Record<string, string>,
	principal: ApiPrincipal,
	request: Request
): Promise<Response> {
	let raw: unknown;
	try {
		raw = await inputOf(request, params);
	} catch (error) {
		if (error instanceof ApiError) return problem(400, error.code, error.message);
		throw error;
	}

	const input = endpoint.input.safeParse(raw);
	if (!input.success) {
		return problem(400, 'invalid_input', 'The request is not valid.', {
			issues: input.error.issues
		});
	}

	try {
		const result = await endpoint.handler({ principal, input: input.data });
		// Serialised through the schema, so a field it does not name never leaves.
		return json(200, endpoint.output.parse(result));
	} catch (error) {
		if (error instanceof ApiError) return problem(error.status, error.code, error.message);
		console.error(`API endpoint ${endpoint.id} failed`, error);
		return problem(500, 'internal_error', 'Something went wrong.');
	}
}
