import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { PAGE_BODY_MAX_LENGTH, PAGE_TITLE_MAX } from '#lib/domain/knowledge.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission, type SessionUser } from '#lib/server/auth/guards.js';
import {
	archivePage,
	createPage,
	movePage,
	pageCreateInput,
	previewMove,
	publishPage,
	reorderPage,
	unarchivePage,
	type Placement
} from '#lib/server/knowledge/index.js';
import { fieldsOf, withId } from '../assets/form-data';

/**
 * What the knowledge screens share: the guard, the failure sentences, and the
 * actions both the space landing and a page's own screen carry (the tree is on
 * both, so reordering and moving must be reachable from both).
 *
 * The app screens are staff only (`knowledge.manage`); an employee reads from
 * the portal once #328 lands, and gets 403 here until then. A viewer without
 * `knowledge.view` at all gets the usual 404. Every action calls the guard too:
 * a form action does not re-run the layout's `load`.
 */
export function requireKnowledgeStaff(user: SessionUser | null, url?: URL): SessionUser {
	const viewer = requirePermission(user, 'knowledge.view', url);
	if (!can(viewer, 'knowledge.manage')) error(403, 'Forbidden');
	return viewer;
}

const MESSAGES: Record<string, () => string> = {
	not_found: () => m.knowledge_error_not_found(),
	space_not_found: () => m.knowledge_error_space_not_found(),
	space_archived: () => m.knowledge_error_space_archived(),
	parent_not_found: () => m.knowledge_error_parent_not_found(),
	parent_archived: () => m.knowledge_error_parent_archived(),
	archived: () => m.knowledge_error_archived(),
	not_archived: () => m.knowledge_error_not_archived(),
	cycle: () => m.knowledge_error_cycle(),
	parent_unpublished: () => m.knowledge_error_parent_unpublished(),
	not_siblings: () => m.knowledge_error_not_siblings(),
	confirmation_required: () => m.knowledge_error_confirmation_required(),
	count_changed: () => m.knowledge_error_count_changed(),
	body_too_long: () => m.knowledge_error_body_too_long({ max: PAGE_BODY_MAX_LENGTH }),
	revision_not_found: () => m.knowledge_error_revision_not_found()
};

/** The sentence for a failure code. A failure with a `kind` (`stale_revision`) is the caller's to word. */
export function failureMessage(error: string): string {
	return (MESSAGES[error] ?? MESSAGES.not_found)();
}

/** A refusal the page can place: which `action` failed and what to say. */
export function refuse(action: string, message: string) {
	return fail(400, { action, message });
}

const accepted = (action: string) => ({ action, message: null });

const optionalId = z.preprocess((value) => (value === '' ? null : value), z.uuid().nullable());

/** A neighbour on the form: `placement` is `before` or `after`, `anchorId` the sibling. */
function placementOf(fields: Record<string, string>): Placement | undefined {
	const anchor = z.uuid().safeParse(fields.anchorId);
	if (!anchor.success) return undefined;
	if (fields.placement === 'before') return { before: anchor.data };
	if (fields.placement === 'after') return { after: anchor.data };
	return undefined;
}

export async function create({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = await fieldsOf(request);
	const parsed = pageCreateInput.safeParse({
		spaceId: fields.spaceId,
		// Absent when the space has no pages (the picker is not rendered): the root.
		parentId: fields.parentId ? fields.parentId : null,
		title: fields.title
	});
	if (!parsed.success) {
		const title = parsed.error.issues.some((issue) => issue.path[0] === 'title');
		if (title && (fields.title ?? '').trim().length > PAGE_TITLE_MAX) {
			return refuse('create', m.knowledge_error_title_too_long({ max: PAGE_TITLE_MAX }));
		}
		return refuse(
			'create',
			title ? m.knowledge_error_title_required() : m.knowledge_error_not_found()
		);
	}

	// The screens create with an empty body; writing it is the editor's job (#324).
	const outcome = await createPage(user, { ...parsed.data, body: '' });
	if (!outcome.ok) return refuse('create', failureMessage(outcome.error));
	redirect(303, `/knowledge/${outcome.value.tag}`);
}

export async function reorder({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = await fieldsOf(request);
	const target = withId.safeParse(fields);
	const placement = placementOf(fields);
	if (!target.success || !placement) return refuse('reorder', failureMessage('not_found'));

	const outcome = await reorderPage(user, target.data.id, placement);
	if (!outcome.ok) return refuse('reorder', failureMessage(outcome.error));
	return accepted('reorder');
}

const moveFields = z.object({
	id: z.uuid(),
	spaceId: z.uuid(),
	parentId: optionalId,
	confirmedCount: z.coerce.number().int().nonnegative().optional()
});

export async function move({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = await fieldsOf(request);
	const parsed = moveFields.safeParse({
		...fields,
		confirmedCount: fields.confirmedCount === '' ? undefined : fields.confirmedCount
	});
	if (!parsed.success) return refuse('move', failureMessage('not_found'));

	const { id, spaceId, parentId, confirmedCount } = parsed.data;
	const outcome = await movePage(
		user,
		id,
		{ spaceId, parentId, position: placementOf(fields) },
		{ confirmedCount }
	);
	if (!outcome.ok) return refuse('move', failureMessage(outcome.error));
	return accepted('move');
}

/** What the "Mover…" dialog asks before it enables its button: the count and whether the audience changes. */
export async function preview({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const fields = await fieldsOf(request);
	const parsed = moveFields.omit({ confirmedCount: true }).safeParse(fields);
	if (!parsed.success) return refuse('preview', failureMessage('not_found'));

	const outcome = await previewMove(user, parsed.data.id, {
		spaceId: parsed.data.spaceId,
		parentId: parsed.data.parentId
	});
	if (!outcome.ok) return refuse('preview', failureMessage(outcome.error));
	return { action: 'preview', message: null, preview: outcome.value };
}

export async function publish({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const target = withId.safeParse(await fieldsOf(request));
	if (!target.success) return refuse('publish', failureMessage('not_found'));

	const outcome = await publishPage(user, target.data.id);
	if (!outcome.ok) return refuse('publish', failureMessage(outcome.error));
	return accepted('publish');
}

export async function archive({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const target = withId.safeParse(await fieldsOf(request));
	if (!target.success) return refuse('archive', failureMessage('not_found'));

	const outcome = await archivePage(user, target.data.id);
	if (!outcome.ok) return refuse('archive', failureMessage(outcome.error));
	return accepted('archive');
}

export async function unarchive({ request, locals, url }: RequestEvent) {
	const user = requireKnowledgeStaff(locals.user, url);
	const target = withId.safeParse(await fieldsOf(request));
	if (!target.success) return refuse('unarchive', failureMessage('not_found'));

	const outcome = await unarchivePage(user, target.data.id);
	if (!outcome.ok) return refuse('unarchive', failureMessage(outcome.error));
	return accepted('unarchive');
}
