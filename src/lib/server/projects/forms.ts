import { fail } from '@sveltejs/kit';
import type { ZodError } from 'zod';
import { uploadedFilesOf, type UploadedFile } from '../shared/attachments';

/**
 * What the projects and tasks actions do with a request: read the string
 * fields, and refuse in the one shape the pages know how to show — which
 * `action` failed, what to say, and which `field` it belongs to so the sentence
 * can sit under it.
 */

export type Fields = {
	get(key: string): string;
	all(key: string): string[];
	/** Whether the form carried the key at all: absent is "leave alone", present-and-empty is "clear". */
	has(key: string): boolean;
};

export async function fieldsOf(request: Request): Promise<Fields> {
	const data = await request.formData();
	const strings = (key: string) =>
		data.getAll(key).filter((value): value is string => typeof value === 'string');

	return {
		get: (key) => strings(key)[0]?.trim() ?? '',
		all: (key) => strings(key).map((value) => value.trim()),
		has: (key) => data.has(key)
	};
}

/**
 * The files a multipart form posted under `files`. Lives with the domain, as
 * `readTicketForm` does for tickets: a route is not where bytes become
 * `UploadedFile`.
 */
export async function readAttachmentForm(
	request: Request
): Promise<{ files: UploadedFile[]; attachmentId: string }> {
	const data = await request.formData();
	const id = data.get('attachmentId');
	return { files: await uploadedFilesOf(data), attachmentId: typeof id === 'string' ? id : '' };
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
