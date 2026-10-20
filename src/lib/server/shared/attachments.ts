import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_COMMENT } from '#lib/domain/attachments.js';
import type { Storage } from './storage';

/**
 * What every domain that holds files does the same way: the limits, turning a
 * multipart body into `UploadedFile`s, and writing their bytes to the `Storage`
 * under a server-generated key. Each domain owns its own attachments table
 * (ADR 0039); only this part is shared.
 */

/** A file as the domain receives it: bytes already read, not a web `File`. */
export interface UploadedFile {
	filename: string;
	contentType: string;
	data: Uint8Array;
}

/** `null` when the files are acceptable, otherwise the reason. */
export function attachmentProblem(files: readonly UploadedFile[]): 'too_many' | 'too_large' | null {
	if (files.length > MAX_ATTACHMENTS_PER_COMMENT) return 'too_many';
	if (files.some((file) => file.data.byteLength > MAX_ATTACHMENT_BYTES)) return 'too_large';
	return null;
}

/**
 * The files of a posted form. Empty file inputs arrive as a zero-byte `File`
 * with no name; they are not attachments.
 */
export async function uploadedFilesOf(data: FormData, key = 'files'): Promise<UploadedFile[]> {
	const files: UploadedFile[] = [];
	for (const value of data.getAll(key)) {
		if (typeof value === 'string' || value.size === 0 || value.name === '') continue;
		files.push({
			filename: value.name,
			contentType: value.type || 'application/octet-stream',
			data: new Uint8Array(await value.arrayBuffer())
		});
	}
	return files;
}

/**
 * Writes the bytes and returns the row values to insert. The key is generated
 * here, never derived from the filename or the request.
 */
export async function storeFiles(storage: Storage, organisationId: string, files: UploadedFile[]) {
	return Promise.all(
		files.map(async (file) => {
			const storageKey = `${organisationId}/${crypto.randomUUID()}`;
			await storage.put(storageKey, file.data);
			return {
				row: {
					filename: file.filename,
					contentType: file.contentType,
					byteSize: file.data.byteLength,
					storageKey
				}
			};
		})
	);
}
