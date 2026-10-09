import type { UploadedFile } from './validation';

/**
 * What a ticket form posts, split into its text fields and its files. Lives
 * with the domain because both route groups (staff and portal) read the same
 * multipart body, and a route should not be where bytes become `UploadedFile`.
 *
 * Empty file inputs arrive as a zero-byte `File` with no name; they are not
 * attachments.
 */
export async function readTicketForm(
	request: Request
): Promise<{ fields: Record<string, string>; files: UploadedFile[]; assetIds: string[] }> {
	const data = await request.formData();
	const fields: Record<string, string> = {};
	const files: UploadedFile[] = [];
	// The one field that repeats: a ticket can be about several assets, and
	// `fields` keeps only the last value of a key.
	const assetIds: string[] = [];

	for (const [key, value] of data) {
		if (typeof value === 'string') {
			if (key === 'assetIds') {
				if (value !== '') assetIds.push(value);
			} else {
				fields[key] = value;
			}
		} else if (value.size > 0 && value.name !== '') {
			files.push({
				filename: value.name,
				contentType: value.type || 'application/octet-stream',
				data: new Uint8Array(await value.arrayBuffer())
			});
		}
	}

	return { fields, files, assetIds };
}
