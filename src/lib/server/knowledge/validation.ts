import { z } from 'zod';
import {
	PAGE_TITLE_MAX,
	SPACE_AUDIENCES,
	SPACE_COLOURS,
	SPACE_DESCRIPTION_MAX,
	SPACE_ICONS,
	SPACE_NAME_MAX
} from '#lib/domain/knowledge.js';

/**
 * Input validation for the spaces catalogue. Reused by the Settings route today
 * and by the REST API later, so a rule is written once.
 *
 * `organisationId` is deliberately not an input (ADR 0004). `icon` and `colour`
 * are keys of the closed sets in `domain/knowledge.ts`: text in the database, so
 * this is where they are held to the list.
 */

/** Trimmed; blank means "not given", which the database stores as `null`. */
const optionalText = (max: number) =>
	z
		.string()
		.nullish()
		.transform((value) => {
			const trimmed = value?.trim() ?? '';
			return trimmed === '' ? null : trimmed;
		})
		.refine((value) => value === null || [...value].length <= max, { message: 'too_long' });

const spaceDetails = {
	name: z.string().trim().min(1).max(SPACE_NAME_MAX),
	description: optionalText(SPACE_DESCRIPTION_MAX),
	icon: z.enum(SPACE_ICONS),
	colour: z.enum(SPACE_COLOURS)
};

export const spaceInput = z.object({
	...spaceDetails,
	audience: z.enum(SPACE_AUDIENCES)
});

/** The audience is not here: changing it has its own confirmed path. */
export const spaceUpdateInput = z.object(spaceDetails);

export type SpaceInput = z.output<typeof spaceInput>;
export type SpaceUpdateInput = z.output<typeof spaceUpdateInput>;

/**
 * A new page: a title, and optionally a body (the screens create with none; the
 * editor is #324). `parentId` null is the root of the space.
 */
export const pageCreateInput = z.object({
	spaceId: z.uuid(),
	parentId: z.uuid().nullable(),
	title: z.string().trim().min(1).max(PAGE_TITLE_MAX),
	body: z.string().default('')
});

export type PageCreateInput = z.input<typeof pageCreateInput>;

/**
 * A save from the editor (#324): the title, the markdown, and the revision the
 * editor started from. The body's length is the domain's to refuse
 * (`body_too_long`), so it is not bounded here.
 */
export const pageSaveInput = z.object({
	title: z.string().trim().min(1).max(PAGE_TITLE_MAX),
	body: z.string(),
	baseRevision: z.coerce.number().int().positive()
});

/** Restoring revision `number`, from the revision the screen showed as current. */
export const revisionRestoreInput = z.object({
	number: z.coerce.number().int().positive(),
	baseRevision: z.coerce.number().int().positive()
});
