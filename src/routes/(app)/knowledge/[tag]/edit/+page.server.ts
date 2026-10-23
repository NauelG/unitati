import { error, fail, redirect } from '@sveltejs/kit';
import { PAGE_TITLE_MAX } from '#lib/domain/knowledge.js';
import { m } from '#lib/paraglide/messages.js';
import { getPageByTag, pageSaveInput, savePage } from '#lib/server/knowledge/index.js';
import { fieldsOf } from '../../../assets/form-data';
import { failureMessage, requireKnowledgeStaff } from '../../actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Writing a page (#324): the title and the body in the `document` editor, saved
 * as a new revision from the one the form was opened on (`baseRevision`). No
 * autosave and no lock while typing: a save that finds the page moved on is
 * refused (`stale_revision`) and the form keeps what the user wrote.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;
	// Archived means read-only: there is nothing to edit until it is unarchived.
	if (page.status === 'archived') redirect(303, `/knowledge/${page.tag}`);

	return {
		page: {
			id: page.id,
			tag: page.tag,
			title: page.title,
			body: page.body,
			revision: page.revision,
			status: page.status
		},
		space: { id: page.space.id, name: page.space.name },
		path: page.path
	};
};

/** What a refused save hands back, so the form shows the user's own text, not the stored one. */
type Kept = { title: string; body: string; baseRevision: string };

export const actions: Actions = {
	default: async ({ request, locals, params, url }) => {
		const user = requireKnowledgeStaff(locals.user, url);
		const fields = await fieldsOf(request);
		const kept: Kept = {
			title: fields.title ?? '',
			body: fields.body ?? '',
			baseRevision: fields.baseRevision ?? ''
		};
		const refuse = (message: string) => fail(400, { ...kept, message, stale: null });

		const found = await getPageByTag(user, params.tag);
		if (!found.ok) return refuse(failureMessage('not_found'));

		const parsed = pageSaveInput.safeParse(fields);
		if (!parsed.success) {
			const title = parsed.error.issues.some((issue) => issue.path[0] === 'title');
			if (!title) return refuse(failureMessage('not_found'));
			return refuse(
				kept.title.trim() === ''
					? m.knowledge_error_title_required()
					: m.knowledge_error_title_too_long({ max: PAGE_TITLE_MAX })
			);
		}

		const outcome = await savePage(user, found.value.id, parsed.data);
		if (!outcome.ok) {
			if (typeof outcome.error === 'object') {
				const { revision, authorName, savedAt } = outcome.error;
				return fail(409, {
					...kept,
					message: null,
					stale: { revision, authorName, savedAt }
				});
			}
			return refuse(failureMessage(outcome.error));
		}
		redirect(303, `/knowledge/${found.value.tag}`);
	}
};
