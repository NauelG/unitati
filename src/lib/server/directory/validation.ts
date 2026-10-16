import { z } from 'zod';

/**
 * Input validation for the directory's writes. Reused by the Settings route
 * today and by the REST API later, so a rule is written once.
 *
 * `organisationId` is deliberately not an input (ADR 0004): the tenancy scope
 * comes from the session, never from the payload.
 */

/** Trimmed; blank means "not given", which the database stores as `null`. */
const optionalText = z
	.string()
	.nullish()
	.transform((value) => {
		const trimmed = value?.trim() ?? '';
		return trimmed === '' ? null : trimmed;
	});

/**
 * A coordinate as the form sends it: text, possibly with a comma as the decimal
 * separator because the UI is es-ES (`40,4168`). A JSON client may send a
 * number or `null`. Blank is "not given".
 */
function coordinate(limit: number) {
	return z.preprocess((value) => {
		if (value === undefined || value === null) return null;
		if (typeof value === 'number') return value;
		if (typeof value !== 'string') return value;
		const trimmed = value.trim();
		if (trimmed === '') return null;
		// `Number('')` is 0 and `Number('1e3')` is valid; only plain decimals are accepted.
		return /^-?\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN;
	}, z.number().min(-limit).max(limit).nullable());
}

export const locationInput = z
	.object({
		name: z.string().trim().min(1),
		parentId: z
			.preprocess((value) => (value === '' ? null : value), z.uuid().nullish())
			.transform((value) => value ?? null),
		code: optionalText,
		address: optionalText,
		notes: optionalText,
		latitude: coordinate(90),
		longitude: coordinate(180)
	})
	.superRefine((value, context) => {
		// Both or neither: half a coordinate points nowhere. The database `CHECK` says the same.
		if ((value.latitude === null) !== (value.longitude === null)) {
			context.addIssue({
				code: 'custom',
				path: [value.latitude === null ? 'latitude' : 'longitude'],
				message: 'coordinates_pair'
			});
		}
	});

export type LocationInput = z.output<typeof locationInput>;
