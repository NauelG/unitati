import { z } from 'zod';

/**
 * What a notification says, frozen when it is written (ADR 0040). The record may
 * be renamed or deleted later; the inbox still reads what it read at the time.
 */
export const snapshotSchema = z.object({
	code: z.string(),
	title: z.string(),
	summary: z.string().optional(),
	excerpt: z.string().max(280).optional(),
	actorName: z.string().optional(),
	/** The comment a notification leads to, for the targets that anchor to one (a page, #326). */
	commentId: z.string().optional()
});

export type Snapshot = z.infer<typeof snapshotSchema>;
