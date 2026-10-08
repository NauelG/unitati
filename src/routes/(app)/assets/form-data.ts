import { fail } from '@sveltejs/kit';
import { z } from 'zod';

/**
 * What every plain (non-Superforms) action in the assets screens does with a
 * request: read the string fields, validate an id, and refuse in the one shape
 * the pages know how to show.
 */

export type Fields = Record<string, string>;

/** Only string entries: a file input has no business in any of these forms. */
export async function fieldsOf(request: Request): Promise<Fields> {
	const data = await request.formData();
	return Object.fromEntries([...data].filter(([, value]) => typeof value === 'string')) as Fields;
}

/** The id a row's own form carries, as a hidden input. */
export const withId = z.object({ id: z.uuid() });

/**
 * A refusal the page can place: which `action` failed, what to say, and — for a
 * row in a list — which row, so the sentence appears under it and not at the top.
 */
export const rejected = (action: string, message: string, id?: string) =>
	fail(400, { action, message, id: id ?? null });
