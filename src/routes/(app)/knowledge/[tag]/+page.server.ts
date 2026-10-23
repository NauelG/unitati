import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { relatedTo } from '#lib/server/links/index.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import {
	addPageAttachments,
	addPageComment,
	editPageComment,
	getPageByTag,
	listPageAttachments,
	listPageComments,
	listSpaces,
	listSpaceTree,
	removePageAttachment
} from '#lib/server/knowledge/index.js';
import { readAttachmentForm } from '#lib/server/projects/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { fieldsOf } from '../../assets/form-data';
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
	// `/knowledge/DOC-####` is the only link ever inserted (#327), so an employee
	// opens it too. They read pages in the portal: the canonical link answers
	// `303` to `/portal/knowledge/DOC-####` once that route exists (#328), and
	// `404` until then. Unreadable is `404` either way.
	const viewer = requirePermission(locals.user, 'knowledge.view', url);
	if (!can(viewer, 'knowledge.manage')) error(404, 'Not found');
	const user = requireKnowledgeStaff(locals.user, url);

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	// Staff read archived pages, so the tree also shows them, or the page being
	// read would be missing from its own tree.
	const showArchived = url.searchParams.get('archived') === '1' || page.status === 'archived';
	const spaces = await listSpaces(user);
	const targets = spaces.filter((space) => space.archivedAt === null);

	const [tree, targetTrees, attachments, comments] = await Promise.all([
		listSpaceTree(user, page.space.id, { includeArchived: showArchived }),
		// The "Mover…" dialog picks a parent from the target space's tree. One read per
		// space, archived pages left out: nothing can be moved under one.
		Promise.all(
			targets.map(async (space) => [space.id, await listSpaceTree(user, space.id)] as const)
		),
		listPageAttachments(user, page.id),
		// Staff only (#326): this route 403s everybody else before it gets here, and
		// the list itself refuses a viewer without `knowledge.manage`.
		listPageComments(user, page.id)
	]);
	if (!attachments.ok) error(404, 'Not found');
	if (!comments.ok) error(404, 'Not found');

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
		// Tickets that cite the page and projects it documents (#327), each scoped
		// to what the viewer may open.
		related: await relatedTo(user, { kind: 'page', id: page.id }),
		bodyHtml: renderMarkdown(page.body, 'document'),
		hasBody: page.body.trim() !== '',
		attachments: attachments.value,
		showArchived,
		tree,
		spaces: targets.map(({ id, name, audience }) => ({ id, name, audience })),
		targetTrees: Object.fromEntries(targetTrees),
		comments: comments.value
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

const commentFields = z.object({ body: z.string() });

/** The sentence for a refused comment write; a body over the limit has its own wording. */
function commentFailure(action: string, code: string) {
	if (code === 'body_too_long') {
		return refuse(action, m.knowledge_comments_error_too_long({ max: RICH_TEXT_MAX_LENGTH }));
	}
	return refuse(action, failureMessage(code));
}

const addComment: Action = async ({ locals, request, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = commentFields.safeParse(await fieldsOf(request));
	if (!fields.success) return refuse('addComment', failureMessage('empty_body'));

	const page = await targetOf(user, params.tag);
	const outcome = await addPageComment(user, page.id, fields.data.body);
	if (!outcome.ok) {
		if (outcome.error === 'not_found') error(404, 'Not found');
		return commentFailure('addComment', outcome.error);
	}
	return { action: 'addComment', message: null };
};

const editComment: Action = async ({ locals, request, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = commentFields.extend({ commentId: z.uuid() }).safeParse(await fieldsOf(request));
	if (!fields.success) return refuse('editComment', failureMessage('empty_body'));

	const outcome = await editPageComment(user, fields.data.commentId, fields.data.body);
	if (!outcome.ok) {
		if (outcome.error === 'not_found') error(404, 'Not found');
		if (outcome.error === 'forbidden') error(403, 'Forbidden');
		return commentFailure('editComment', outcome.error);
	}
	return { action: 'editComment', message: null };
};

export const actions = {
	addAttachments,
	addComment,
	archive,
	create,
	editComment,
	move,
	preview,
	publish,
	removeAttachment,
	reorder,
	unarchive
};
