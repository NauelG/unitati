import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import {
	getPageByTag,
	getRevision,
	listRevisions,
	restoreRevision,
	revisionRestoreInput
} from '#lib/server/knowledge/index.js';
import { fieldsOf } from '../../../../assets/form-data';
import { failureMessage, requireKnowledgeStaff } from '../../../actions';
import type { Actions, PageServerLoad } from './$types';

const revisionNumber = z.coerce.number().int().positive();

/** One revision, rendered read-only (#324), with "Restaurar esta versión" and the history beside it. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const number = revisionNumber.safeParse(params.n);
	if (!number.success) error(404, 'Not found');

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	const [revision, history] = await Promise.all([
		getRevision(user, page.id, number.data),
		listRevisions(user, page.id)
	]);
	if (!revision.ok || !history.ok) error(404, 'Not found');

	return {
		page: {
			id: page.id,
			tag: page.tag,
			title: page.title,
			revision: page.revision,
			status: page.status
		},
		space: { id: page.space.id, name: page.space.name },
		path: page.path,
		revision: {
			number: revision.value.number,
			title: revision.value.title,
			authorName: revision.value.authorName,
			createdAt: revision.value.createdAt,
			bodyHtml: renderMarkdown(revision.value.body, 'document'),
			hasBody: revision.value.body.trim() !== ''
		},
		history: history.value
	};
};

export const actions: Actions = {
	restore: async ({ request, locals, params, url }) => {
		const user = requireKnowledgeStaff(locals.user, url);
		const parsed = revisionRestoreInput.safeParse({
			...(await fieldsOf(request)),
			number: params.n
		});
		const found = await getPageByTag(user, params.tag);
		if (!parsed.success || !found.ok) {
			return fail(400, { action: 'restore', message: failureMessage('not_found') });
		}

		const outcome = await restoreRevision(user, found.value.id, parsed.data.number, {
			baseRevision: parsed.data.baseRevision
		});
		if (!outcome.ok) {
			// The page moved on while the user decided: a conflict, as a stale save is.
			if (typeof outcome.error === 'object') {
				return fail(409, {
					action: 'restore',
					message: m.knowledge_error_stale_restore({ revision: outcome.error.revision })
				});
			}
			return fail(400, { action: 'restore', message: failureMessage(outcome.error) });
		}
		redirect(303, `/knowledge/${found.value.tag}`);
	}
};
