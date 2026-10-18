import { fail, type RequestEvent } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { countAssetsByLocation } from '#lib/server/assets/index.js';
import {
	countLocationChildren,
	createLocation,
	deleteLocation,
	listLocations,
	locationInput,
	updateLocation
} from '#lib/server/directory/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, withId } from '../../../assets/form-data';

/**
 * Locations are a catalogue with more than three fields, so they get a `Sheet`
 * on their own list page and no `/new` or `/[id]` route (ADR 0027, ADR 0020).
 * Page and actions guard on the same registry entry.
 */
const SECTION = '/settings/assets/locations';

type FieldName = 'name' | 'parentId' | 'code' | 'address' | 'notes' | 'latitude' | 'longitude';
type FieldErrors = Partial<Record<FieldName, string>>;

/** A refusal the page can place: on a field of the Sheet, or as a sentence. */
function refuse(action: string, message: string | null, id?: string, errors: FieldErrors = {}) {
	return fail(400, { action, message, id: id ?? null, errors });
}

const accepted = (action: string) => ({
	action,
	message: null,
	id: null,
	errors: {} as FieldErrors
});

function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
	const errors: FieldErrors = {};
	for (const issue of issues) {
		const field = issue.path[0] as FieldName | undefined;
		if (field === undefined || errors[field]) continue;
		errors[field] = (() => {
			switch (field) {
				case 'name':
					return m.validation_name_required();
				case 'parentId':
					return m.locations_error_parent_missing();
				case 'latitude':
				case 'longitude':
					return issue.message === 'coordinates_pair'
						? m.locations_error_coordinates_pair()
						: m.locations_error_coordinates_range({
								limit: field === 'latitude' ? 90 : 180
							});
				default:
					return m.locations_error_invalid();
			}
		})();
	}
	return errors;
}

const FAILURES = {
	duplicate_name: ['name', () => m.locations_error_duplicate_name()],
	duplicate_code: ['code', () => m.locations_error_duplicate_code()],
	parent_not_found: ['parentId', () => m.locations_error_parent_missing()],
	cycle: ['parentId', () => m.locations_error_cycle()]
} as const satisfies Record<string, readonly [FieldName, () => string]>;

function failureOf(error: string): { errors: FieldErrors; message: string | null } {
	const known = FAILURES[error as keyof typeof FAILURES];
	if (known) return { errors: { [known[0]]: known[1]() }, message: null };
	return { errors: {}, message: m.locations_error_not_found() };
}

export const load = async ({ locals }: RequestEvent) => {
	const user = requireSettingsSection(locals.user, SECTION);
	// Two domains, composed here: neither imports the other's tables.
	const [entries, counts] = await Promise.all([
		listLocations(user.organisationId),
		countAssetsByLocation(user.organisationId)
	]);
	return {
		locations: entries.map((entry) => ({ ...entry, assets: counts.get(entry.id) ?? 0 }))
	};
};

export const actions = {
	create: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = locationInput.safeParse(await fieldsOf(request));
		if (!parsed.success)
			return refuse('create', null, undefined, fieldErrorsOf(parsed.error.issues));

		const outcome = await createLocation(user, parsed.data);
		if (!outcome.ok) {
			const { errors, message } = failureOf(outcome.error);
			return refuse('create', message, undefined, errors);
		}
		return accepted('create');
	},

	update: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		if (!target.success) return refuse('update', m.locations_error_not_found());

		const parsed = locationInput.safeParse(fields);
		if (!parsed.success) {
			return refuse('update', null, target.data.id, fieldErrorsOf(parsed.error.issues));
		}

		const outcome = await updateLocation(user, target.data.id, parsed.data);
		if (!outcome.ok) {
			const { errors, message } = failureOf(outcome.error);
			return refuse('update', message, target.data.id, errors);
		}
		return accepted('update');
	},

	delete: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return refuse('delete', m.locations_error_not_found());

		const outcome = await deleteLocation(user, target.data.id);
		if (outcome.ok) return accepted('delete');
		if (outcome.error === 'not_found') {
			return refuse('delete', m.locations_error_not_found(), target.data.id);
		}

		const [children, assets] = await Promise.all([
			countLocationChildren(user.organisationId, target.data.id),
			countAssetsByLocation(user.organisationId).then((counts) => counts.get(target.data.id) ?? 0)
		]);
		const parts = [
			children > 0
				? children === 1
					? m.locations_in_use_children_one()
					: m.locations_in_use_children_other({ count: children })
				: null,
			assets > 0
				? assets === 1
					? m.locations_in_use_assets_one()
					: m.locations_in_use_assets_other({ count: assets })
				: null
		].filter((part) => part !== null);

		return refuse(
			'delete',
			parts.length === 0
				? m.locations_in_use_unknown()
				: m.locations_in_use({ detail: parts.join(m.locations_in_use_and()) }),
			target.data.id
		);
	}
};
