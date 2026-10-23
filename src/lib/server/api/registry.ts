import type { z } from 'zod';
import type { Permission } from '../access/permissions';
import type { Failure } from '../shared/outcome';
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
		readonly status: 400 | 403 | 404 | 409 | 422,
		readonly code: string,
		message: string,
		/** Field-level problems, in the shape Zod reports them, for a `400` the handler found itself. */
		readonly issues?: readonly { path: readonly (string | number)[]; message: string }[],
		/** Structured facts about the refusal (`in_use` carries its counts), serialised as `error.details`. */
		readonly details?: Record<string, unknown>
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

/** The message of a `409` whose entry gives none: the code, spelled as a sentence. */
export const defaultConflictMessage = (code: string): string =>
	code.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) + '.';

/**
 * The refusal table (ADR 0047). An endpoint says, next to its schemas, how the
 * API answers each failure its domain call can return. The vocabulary is
 * closed and every entry has a statically known status, so the OpenAPI
 * document is derived from the table without running anything.
 *
 * `M` is the failure member the entry answers: the object itself for a failure
 * keyed by `kind`, `never` for a plain string code (there is nothing to compute from).
 */
export type RefusalEntry<M = never> =
	/** `404 not_found`: a record that is not there, or that the key may not know about (ADR 0007). */
	| { as: 'not_found'; message?: string }
	/** `409`, whose code is the failure's own name. */
	| {
			as: 'conflict';
			/** Defaults to the code as a sentence, as `refusal()` always did. */
			message?: string | ((failure: M) => string);
			/** Structured facts, serialised as `error.details`. */
			details?: (failure: M) => Record<string, unknown>;
			/** One line for the documentation, for facts the message does not carry. */
			describe?: string;
	  }
	/** `400 invalid_input` with one issue on a named body field. */
	| { as: 'field'; path: string; message: string | ((failure: M) => string) }
	/** `403 forbidden_create`: the key may see the record but not create what is asked. */
	| { as: 'forbidden' }
	/** `422 invalid_input`: the domain rejected values that parsed. */
	| { as: 'unprocessable' }
	/**
	 * Impossible given this endpoint's input (the API accepts no attachments, offers
	 * no waiver). Never documented; reaching it is a bug and answers `500`.
	 * `why` is mandatory so the assumption is written where it is made.
	 */
	| { as: 'unreachable'; why: string };

/** The key a failure has in a table: the code itself, or the `kind` of an object failure. */
export type FailureKey<F> = F extends string
	? F
	: F extends { kind: infer K extends string }
		? K
		: never;

/** One entry per member of the failure union, and no other: exhaustive in both directions. */
export type RefusalEntries<F extends Failure> = {
	[K in FailureKey<F>]: RefusalEntry<Extract<F, { kind: K }>>;
};

/** The table an endpoint declares. `F` is carried by the type only: it is what `refuse` accepts. */
export interface RefusalTable<F extends Failure = Failure> {
	/** Exhaustiveness is checked by `refusalTable()`; the stored form is loose so `F` stays easy to compare. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly entries: Readonly<Record<string, RefusalEntry<any>>>;
	readonly __failure?: F;
}

/**
 * Builds a table. `F` is named explicitly (the failure union the handler refuses
 * with), so a member missing from `entries`, or one that is not in `F`, does not compile.
 */
export function refusalTable<F extends Failure>(entries: RefusalEntries<F>): RefusalTable<F> {
	return { entries: entries as RefusalTable<F>['entries'] };
}

const keyOf = (failure: Failure): string => (typeof failure === 'string' ? failure : failure.kind);

/** The `ApiError` a failure answers with, per its table entry. An unreachable entry yields a plain `Error`: a `500`. */
export function resolveRefusal<F extends Failure>(
	endpointId: string,
	table: RefusalTable<F> | undefined,
	failure: F
): Error {
	const key = keyOf(failure);
	if (!table)
		return new Error(`Endpoint ${endpointId} declares no refusal table (refused ${key}).`);
	const entry = table.entries[key];
	if (!entry) return new Error(`Endpoint ${endpointId} has no refusal entry for ${key}.`);

	// The entry's functions take the typed member; the table type guarantees it is the right one.
	const member = failure as never;
	switch (entry.as) {
		case 'not_found':
			return notFound(entry.message);
		case 'conflict': {
			const message = typeof entry.message === 'function' ? entry.message(member) : entry.message;
			return new ApiError(
				409,
				key,
				message ?? defaultConflictMessage(key),
				undefined,
				entry.details?.(member)
			);
		}
		case 'field':
			return new ApiError(400, 'invalid_input', 'The request is not valid.', [
				{
					path: [entry.path],
					message: typeof entry.message === 'function' ? entry.message(member) : entry.message
				}
			]);
		case 'forbidden':
			return new ApiError(403, 'forbidden_create', 'The key may not create this record.');
		case 'unprocessable':
			return new ApiError(422, 'invalid_input', 'The values are not valid.');
		case 'unreachable':
			return new Error(
				`Endpoint ${endpointId} reached an unreachable refusal ${key}: ${entry.why}`
			);
	}
}

export interface Endpoint<
	I extends z.ZodType = z.ZodType,
	O extends z.ZodType = z.ZodType,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry holds endpoints of every failure union
	F extends Failure = any
> {
	/** Stable use-case id, e.g. `tickets.list`. */
	id: string;
	method: HttpMethod;
	/** Relative to `/api/v1`; `{name}` segments are path parameters. */
	path: string;
	summary: string;
	/** Markdown, English: what the use case does beyond its one-line summary. Shown in the documentation. */
	description?: string;
	/** A sample request body (or query) for the documentation and its `curl`. */
	example?: Record<string, unknown>;
	/** The success status. `200` unless it creates something; `204` is implied by a `z.null()` output. */
	status?: 200 | 201;
	/**
	 * Refusals beyond the ones every operation can raise (`400`, `401`, `404`,
	 * `409`, `429`), so the documentation lists them: `403` for an act the key may
	 * name but not do, `422` for input that parses and that the domain rejects.
	 */
	refusals?: readonly (403 | 422)[];
	/**
	 * Every failure the handler refuses with, each mapped to one answer (ADR 0047).
	 * When present, the documentation derives the error responses from it and
	 * `refusals` is ignored. Endpoints not yet migrated keep the generic behaviour.
	 */
	refusalTable?: RefusalTable<F>;
	/** "Any of", like `requireAnyPermission`. Never empty. */
	permissions: readonly [Permission, ...Permission[]];
	/** Path parameters, query string and JSON body, merged; path parameters win. */
	input: I;
	output: O;
	handler: (context: {
		principal: ApiPrincipal;
		input: z.output<I>;
		/** The `ApiError` to throw for a failure; accepts only what this endpoint's table covers. */
		refuse: (failure: F) => Error;
	}) => Promise<z.input<O> | Reply<z.input<O>>>;
}

/** Identity at runtime; exists so each declaration's schemas and handler are checked against each other. */
export function defineEndpoint<I extends z.ZodType, O extends z.ZodType, F extends Failure = never>(
	endpoint: Endpoint<I, O, F>
): Endpoint<I, O, F> {
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
