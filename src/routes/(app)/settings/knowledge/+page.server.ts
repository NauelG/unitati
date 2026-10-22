import { fail, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { SPACE_AUDIENCES, SPACE_DESCRIPTION_MAX, SPACE_NAME_MAX } from '#lib/domain/knowledge.js';
import { m } from '#lib/paraglide/messages.js';
import {
	archiveSpace,
	changeSpaceAudience,
	createSpace,
	deleteSpace,
	listSpaces,
	previewAudienceChange,
	spaceInput,
	spaceUpdateInput,
	updateSpace
} from '#lib/server/knowledge/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, withId } from '../../assets/form-data';

/**
 * The catalogue of knowledge spaces. More than three fields, so it is edited in a
 * `Sheet` on its own list page with no `/new` or `/[id]` (ADR 0027 §8). Page and
 * actions guard on the same registry entry.
 *
 * Changing the audience of an existing space is two steps, because it publishes
 * or hides pages: `?/preview` answers the exact count, the page confirms it, and
 * `?/update` carries that count back so the domain can refuse a stale one.
 */
const SECTION = '/settings/knowledge';

type FieldName = 'name' | 'description' | 'icon' | 'colour' | 'audience';
type FieldErrors = Partial<Record<FieldName, string>>;

function refuse(action: string, message: string | null, id?: string, errors: FieldErrors = {}) {
	return fail(400, { action, message, id: id ?? null, errors });
}

const accepted = (action: string, extra: { count?: number } = {}) => ({
	action,
	message: null,
	id: null,
	errors: {} as FieldErrors,
	count: extra.count ?? null
});

function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; code: string }[]) {
	const errors: FieldErrors = {};
	for (const issue of issues) {
		const field = issue.path[0] as FieldName | undefined;
		if (field === undefined || errors[field]) continue;
		const tooLong = issue.code === 'too_big' || issue.code === 'custom';
		errors[field] = (() => {
			switch (field) {
				case 'name':
					return tooLong
						? m.knowledge_space_error_name_too_long({ max: SPACE_NAME_MAX })
						: m.knowledge_space_error_name_required();
				case 'description':
					return m.knowledge_space_error_description_too_long({ max: SPACE_DESCRIPTION_MAX });
				case 'icon':
					return m.knowledge_space_error_icon();
				case 'colour':
					return m.knowledge_space_error_colour();
				case 'audience':
					return m.knowledge_space_error_audience();
			}
		})();
	}
	return errors;
}

const FAILURES = {
	duplicate_name: ['name', () => m.knowledge_space_error_duplicate_name()],
	invalid_icon: ['icon', () => m.knowledge_space_error_icon()],
	invalid_colour: ['colour', () => m.knowledge_space_error_colour()]
} as const satisfies Record<string, readonly [FieldName, () => string]>;

function failureOf(error: string): { errors: FieldErrors; message: string | null } {
	const known = FAILURES[error as keyof typeof FAILURES];
	if (known) return { errors: { [known[0]]: known[1]() }, message: null };
	switch (error) {
		case 'archived':
			return { errors: {}, message: m.knowledge_space_error_archived() };
		case 'count_changed':
			return { errors: {}, message: m.knowledge_space_error_count_changed() };
		case 'has_pages':
			return { errors: {}, message: m.knowledge_space_error_has_pages() };
		default:
			return { errors: {}, message: m.knowledge_space_error_not_found() };
	}
}

const audienceField = z.enum(SPACE_AUDIENCES);
const countField = z.coerce.number().int().nonnegative();

export const load = async ({ locals, url }: RequestEvent) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const showArchived = url.searchParams.get('archived') === '1';
	return {
		showArchived,
		spaces: await listSpaces(user, { includeArchived: showArchived })
	};
};

export const actions = {
	create: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = spaceInput.safeParse(await fieldsOf(request));
		if (!parsed.success) {
			return refuse('create', null, undefined, fieldErrorsOf(parsed.error.issues));
		}

		const outcome = await createSpace(user, parsed.data);
		if (!outcome.ok) {
			const { errors, message } = failureOf(outcome.error);
			return refuse('create', message, undefined, errors);
		}
		return accepted('create');
	},

	preview: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		const audience = audienceField.safeParse(fields.audience);
		if (!target.success || !audience.success) {
			return refuse('preview', m.knowledge_space_error_not_found());
		}

		const outcome = await previewAudienceChange(user, target.data.id, audience.data);
		if (!outcome.ok) {
			return refuse('preview', failureOf(outcome.error).message, target.data.id);
		}
		return accepted('preview', { count: outcome.value.pageCount });
	},

	update: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		if (!target.success) return refuse('update', m.knowledge_space_error_not_found());

		const parsed = spaceUpdateInput.safeParse(fields);
		if (!parsed.success) {
			return refuse('update', null, target.data.id, fieldErrorsOf(parsed.error.issues));
		}

		// The audience first: it is the change that can be refused for a reason the
		// admin must see, and nothing else should be saved behind their back.
		const audience = audienceField.safeParse(fields.audience);
		const confirmed = countField.safeParse(fields.confirmedCount);
		if (audience.success) {
			if (!confirmed.success) {
				return refuse('update', m.knowledge_space_error_count_changed(), target.data.id);
			}
			const changed = await changeSpaceAudience(user, target.data.id, audience.data, {
				confirmedCount: confirmed.data
			});
			if (!changed.ok) {
				const { errors, message } = failureOf(changed.error);
				return refuse('update', message, target.data.id, errors);
			}
		}

		const outcome = await updateSpace(user, target.data.id, parsed.data);
		if (!outcome.ok) {
			const { errors, message } = failureOf(outcome.error);
			return refuse('update', message, target.data.id, errors);
		}
		return accepted('update');
	},

	archive: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return refuse('archive', m.knowledge_space_error_not_found());

		const outcome = await archiveSpace(user, target.data.id);
		if (!outcome.ok) {
			return refuse('archive', failureOf(outcome.error).message, target.data.id);
		}
		return accepted('archive');
	},

	delete: async ({ request, locals }: RequestEvent) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return refuse('delete', m.knowledge_space_error_not_found());

		const outcome = await deleteSpace(user, target.data.id);
		if (!outcome.ok) {
			return refuse('delete', failureOf(outcome.error).message, target.data.id);
		}
		return accepted('delete');
	}
};
