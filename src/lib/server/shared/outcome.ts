/**
 * Result of a domain operation. Expected business failures are typed values,
 * not exceptions; routes map them to HTTP (see ADR 0002).
 */
export type Outcome<T, E extends string = string> =
	{ ok: true; value: T } | { ok: false; error: E };

export const success = <T>(value: T): Outcome<T, never> => ({ ok: true, value });

export const failure = <E extends string>(error: E): Outcome<never, E> => ({ ok: false, error });
