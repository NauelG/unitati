import type { z } from 'zod';
import type { Permission } from '../access/permissions';
import type { ApiPrincipal } from './keys';

/**
 * The endpoint registry (ADR 0022). An endpoint is declared **once**, and that
 * one declaration drives input validation, authorisation and — in slice C — the
 * OpenAPI document. Nothing else describes an endpoint, so the documentation
 * cannot drift from what is served.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A refusal a handler raises on purpose; the dispatcher maps it to the envelope. */
export class ApiError extends Error {
	constructor(
		readonly status: 400 | 404 | 409,
		readonly code: string,
		message: string,
		/** Field-level problems, in the shape Zod reports them, for a `400` the handler found itself. */
		readonly issues?: readonly { path: readonly (string | number)[]; message: string }[]
	) {
		super(message);
	}
}

/**
 * A success that is not a plain `200`: a created resource, or nothing to say.
 * A handler that returns its body bare answers `200`.
 */
export class Reply<T = unknown> {
	constructor(
		readonly status: 200 | 201 | 204,
		readonly body: T,
		readonly headers: Record<string, string> = {}
	) {}
}

/** `201` with the new resource's address. */
export const created = <T>(body: T, location: string) =>
	new Reply(201, body, { location: `/api/v1${location}` });

/** `204`: the output schema of such an endpoint is `z.null()`. */
export const noContent = () => new Reply(204, null);

/** The domain's `not_found`, or a record the principal may not see: the same answer (ADR 0007). */
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);

/** A domain refusal, such as an illegal transition. */
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

export interface Endpoint<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
	/** Stable use-case id, e.g. `tickets.list`. */
	id: string;
	method: HttpMethod;
	/** Relative to `/api/v1`; `{name}` segments are path parameters. */
	path: string;
	summary: string;
	/** "Any of", like `requireAnyPermission`. Never empty. */
	permissions: readonly [Permission, ...Permission[]];
	/** Path parameters, query string and JSON body, merged; path parameters win. */
	input: I;
	output: O;
	handler: (context: {
		principal: ApiPrincipal;
		input: z.output<I>;
	}) => Promise<z.input<O> | Reply<z.input<O>>>;
}

/** Identity at runtime; exists so each declaration's schemas and handler are checked against each other. */
export function defineEndpoint<I extends z.ZodType, O extends z.ZodType>(
	endpoint: Endpoint<I, O>
): Endpoint<I, O> {
	if (endpoint.permissions.length === 0) {
		throw new Error(`Endpoint ${endpoint.id} needs at least one permission.`);
	}
	return endpoint;
}

/** Splits a declared path into segments once, so matching is a loop and not a regex per request. */
export function matchPath(template: string, pathname: string): Record<string, string> | null {
	const expected = template.split('/').filter(Boolean);
	const actual = pathname.split('/').filter(Boolean);
	if (expected.length !== actual.length) return null;

	const params: Record<string, string> = {};
	for (const [index, segment] of expected.entries()) {
		const parameter = /^\{(\w+)\}$/.exec(segment);
		if (parameter) {
			try {
				params[parameter[1]] = decodeURIComponent(actual[index]);
			} catch {
				return null;
			}
		} else if (segment !== actual[index]) {
			return null;
		}
	}
	return params;
}
