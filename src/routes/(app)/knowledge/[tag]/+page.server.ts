import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
import { m } from '#lib/paraglide/messages.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import {
	addPageAttachments,
	getPageByTag,
	listPageAttachments,
	listSpaces,
	listSpaceTree,
	removePageAttachment
} from '#lib/server/knowledge/index.js';
import { readAttachmentForm } from '#lib/server/projects/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import {
	archive,
	create,
	move,
	preview,
	publish,
	failureMessage,
	refuse,
	reorder,
	requireKnowledgeStaff,
	unarchive
} from '../actions';
import type { Action, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	// Staff read archived pages, so the tree also shows them, or the page being
	// read would be missing from its own tree.
	const showArchived = url.searchParams.get('archived') === '1' || page.status === 'archived';
	const spaces = await listSpaces(user);
	const targets = spaces.filter((space) => space.archivedAt === null);

	const [tree, targetTrees, attachments] = await Promise.all([
		listSpaceTree(user, page.space.id, { includeArchived: showArchived }),
		// The "Mover…" dialog picks a parent from the target space's tree. One read per
		// space, archived pages left out: nothing can be moved under one.
		Promise.all(
			targets.map(async (space) => [space.id, await listSpaceTree(user, space.id)] as const)
		),
		listPageAttachments(user, page.id)
	]);
	if (!attachments.ok) error(404, 'Not found');

	return {
		page: {
			id: page.id,
			tag: page.tag,
			title: page.title,
			status: page.status,
			parentId: page.parentId,
			updatedAt: page.updatedAt,
			revision: page.revision,
			revisionAuthorName: page.revisionAuthorName,
			revisedAt: page.revisedAt
		},
		space: page.space,
		path: page.path,
		bodyHtml: renderMarkdown(page.body, 'document'),
		hasBody: page.body.trim() !== '',
		attachments: attachments.value,
		showArchived,
		tree,
		spaces: targets.map(({ id, name, audience }) => ({ id, name, audience })),
		targetTrees: Object.fromEntries(targetTrees)
	};
};

/** The page an attachment action targets; gone or unreadable reads as missing. */
async function targetOf(user: SessionUser, tag: string) {
	const found = await getPageByTag(user, tag);
	if (!found.ok) error(404, 'Not found');
	return found.value;
}

const addAttachments: Action = async ({ request, locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const { files } = await readAttachmentForm(request);
	if (files.length === 0) return refuse('addAttachments', m.attachments_pick_none());

	const page = await targetOf(user, params.tag);
	const outcome = await addPageAttachments(user, page.id, files);
	if (!outcome.ok) {
		if (outcome.error === 'not_found') error(404, 'Not found');
		return refuse(
			'addAttachments',
			outcome.error === 'archived'
				? failureMessage('archived')
				: attachmentFailureMessage(outcome.error)
		);
	}
	return { action: 'addAttachments', message: null };
};

const removeAttachment: Action = async ({ request, locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const { attachmentId } = await readAttachmentForm(request);
	if (!z.uuid().safeParse(attachmentId).success) {
		return refuse('removeAttachment', m.action_error_invalid());
	}

	// The page must be one the viewer can reach; the domain then resolves the
	// attachment inside the organisation.
	await targetOf(user, params.tag);
	const outcome = await removePageAttachment(user, attachmentId);
	// Already gone, e.g. a second tab removed it first: the reload shows the truth.
	if (!outcome.ok && outcome.error !== 'attachment_not_found') {
		return refuse('removeAttachment', failureMessage(outcome.error));
	}
	return { action: 'removeAttachment', message: null };
};

export const actions = {
	addAttachments,
	archive,
	create,
	move,
	preview,
	publish,
	removeAttachment,
	reorder,
	unarchive
};
