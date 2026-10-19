/**
 * Limits on the files attached to a comment. Shared by the server (which enforces
 * them) and the composer (which checks them before the post, so the visitor learns
 * of a refusal without losing the message).
 */
export const MAX_ATTACHMENTS_PER_COMMENT = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Human-readable size: `512 B`, `1.5 KB`, `10 MB`. Binary units, as the limit is in MiB. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
	return `${rounded} ${units[unit]}`;
}

export interface AttachmentSelection<T extends { size: number }> {
	/** The files to keep: the current selection plus whichever incoming ones fit. */
	files: T[];
	/** Incoming files over the size limit. */
	tooLarge: T[];
	/** Incoming files that would exceed the count limit. */
	overflow: T[];
}

/** Appends `incoming` to `current`, rejecting what breaks a limit and keeping the rest. */
export function addAttachments<T extends { size: number }>(
	current: readonly T[],
	incoming: readonly T[]
): AttachmentSelection<T> {
	const files = [...current];
	const tooLarge: T[] = [];
	const overflow: T[] = [];
	for (const file of incoming) {
		if (file.size > MAX_ATTACHMENT_BYTES) tooLarge.push(file);
		else if (files.length >= MAX_ATTACHMENTS_PER_COMMENT) overflow.push(file);
		else files.push(file);
	}
	return { files, tooLarge, overflow };
}
