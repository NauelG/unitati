import { fail } from '@sveltejs/kit';
import type { ZodError } from 'zod';

/**
 * What the projects and tasks actions do with a request: read the string
 * fields, and refuse in the one shape the pages know how to show — which
 * `action` failed, what to say, and which `field` it belongs to so the sentence
 * can sit under it.
 */

export type Fields = { get(key: string): string; all(key: string): string[] };

export async function fieldsOf(request: Request): Promise<Fields> {
	const data = await request.formData();
	const strings = (key: string) =>
		data.getAll(key).filter((value): value is string => typeof value === 'string');

	return {
		get: (key) => strings(key)[0]?.trim() ?? '',
		all: (key) => strings(key).map((value) => value.trim())
	};
}

/** An empty box is "no value", which for an optional field is a real choice. */
export const orNull = (value: string): string | null => (value === '' ? null : value);

export const rejected = (action: string, message: string, field: string | null = null) =>
	fail(400, { action, message, field });

/** The field a validation error is about: the first one Zod names. */
export function firstField(error: ZodError): string | null {
	const key = error.issues[0]?.path[0];
	return typeof key === 'string' ? key : null;
}
