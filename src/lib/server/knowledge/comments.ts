import { and, asc, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import { addedMentions, extractMentions } from '#lib/domain/mentions.js';
import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
import { roleCan } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { userRole, users } from '../auth/schema';
import { getDb, type Executor, type Transaction } from '../db';
import { people } from '../directory/schema';
import { notify, sendNotificationEmails, type PendingEmail } from '../notifications';
import { m } from '#lib/paraglide/messages.js';
import { renderMarkdown } from '../shared/markdown';
import { likePattern, MENTION_PICKER_LIMIT, mentionSnapshot } from '../shared/mentions';
import { failure, success, type Outcome } from '../shared/outcome';
import type { Mailer } from '../shared/mail';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { autoFollowPage } from './following';
import { readablePages, requirePagesManage } from './scope';
import { pageComments, pages } from './schema';

/**
 * Staff comments on a page (#326, #17): `knowledge.manage` reads and writes
 * them, in `staff` and `portal` spaces alike; an employee never receives them,
 * not even a count. A flat list, oldest first. The author may edit
 * (`edited_at`); nobody deletes. They are not part of the page's content or
 * history: no revision, no activity. Since #330 a comment follows the page for
 * its author and the people it names, and tells the page's followers.
 *
 * A mention notifies with the `mention` type, targeting the page. **Never trust
 * the client**: a token only becomes a notification when `mentionablesForPage`
 * would have offered that person.
 */

export type PageCommentFailure = 'not_found' | 'page_archived' | 'body_too_long' | 'empty_body';
export type PageCommentEditFailure = PageCommentFailure | 'forbidden';

export type PageCommentView = {
	id: string;
	authorPersonId: string | null;
	authorName: string | null;
	body: string;
	/** `body` rendered as sanitised HTML (ADR 0030). */
	bodyHtml: string;
	createdAt: Date;
	/** Null when never edited. */
	editedAt: Date | null;
	/** Whether the viewer wrote it and the page is open: computed here, so the template only reads a flag. */
	canEdit: boolean;
};

export type PageMentionable = { id: string; label: string; hint: string };

export type PageCommentDeps = { mailer?: Mailer | null; origin?: string };

/** The roles that hold `knowledge.manage`: the only people a page comment can name. */
const STAFF_ROLES = userRole.enumValues.filter((role) => roleCan(role, 'knowledge.manage'));

function resolveDeps(deps: PageCommentDeps) {
	return {
		mailer: deps.mailer === undefined ? runtimeMailer() : deps.mailer,
		origin: deps.origin ?? runtimeOrigin()
	};
}

/** The active staff `actor` may name, never themself. `only` limits it to the ids a write found. */
async function mentionables(
	executor: Executor,
	actor: Pick<SessionUser, 'personId' | 'organisationId'>,
	options: { query?: string; only?: string[]; limit?: number } = {}
): Promise<PageMentionable[]> {
	if (options.only?.length === 0) return [];
	const rows = await executor
		.select({ id: people.id, fullName: people.fullName, email: people.email })
		.from(people)
		.innerJoin(users, eq(people.userId, users.id))
		.where(
			and(
				eq(people.organisationId, actor.organisationId),
				eq(people.active, true),
				inArray(users.role, STAFF_ROLES),
				actor.personId ? ne(people.id, actor.personId) : undefined,
				options.only ? inArray(people.id, options.only) : undefined,
				options.query
					? or(
							ilike(people.fullName, likePattern(options.query)),
							ilike(people.email, likePattern(options.query))
						)
					: undefined
			)
		)
		.orderBy(asc(people.fullName), asc(people.id))
		.limit(options.limit ?? 1000);
	return rows.map((row) => ({ id: row.id, label: row.fullName, hint: row.email }));
}

/** The picker's source: at most 8 staff matching `query`, never the viewer. */
export async function mentionablesForPage(
	viewer: SessionUser,
	query: string
): Promise<PageMentionable[]> {
	requirePagesManage(viewer);
	return mentionables(getDb(), viewer, {
		query: query.trim() || undefined,
		limit: MENTION_PICKER_LIMIT
	});
}

/** The people a body names that `actor` may actually notify; a forged token reaches nobody. */
async function allowedMentions(
	executor: Executor,
	actor: Pick<SessionUser, 'personId' | 'organisationId'>,
	candidates: string[]
): Promise<string[]> {
	if (candidates.length === 0) return [];
	const allowed = new Set(
		(await mentionables(executor, actor, { only: candidates })).map((person) => person.id)
	);
	return candidates.filter((id) => allowed.has(id));
}

/** A page the actor can read, archived included; `undefined` when it is not theirs to see. */
async function readablePage(executor: Executor, actor: SessionUser, pageId: string) {
	const [page] = await executor
		.select({
			id: pages.id,
			pageTag: pages.pageTag,
			title: pages.title,
			archivedAt: pages.archivedAt
		})
		.from(pages)
		.where(and(eq(pages.id, pageId), readablePages(actor, { includeArchived: true })))
		.limit(1);
	return page;
}

/**
 * Notifies the people named in `candidates` and allowed, and starts them
 * following the page (#330). A new comment (`followers`) also tells whoever
 * follows it; an edit only tells the people it newly names. Returns the mails
 * for after commit.
 */
async function notifyMentioned(
	tx: Transaction,
	actor: SessionUser,
	page: { id: string; pageTag: string; title: string },
	commentId: string,
	body: string,
	candidates: string[],
	options: { followers: boolean }
): Promise<PendingEmail[]> {
	const mentioned = await allowedMentions(tx, actor, candidates);
	await autoFollowPage(tx, actor.organisationId, page.id, mentioned);
	if (mentioned.length === 0 && !options.followers) return [];
	return notify(tx, {
		organisationId: actor.organisationId,
		actorPersonId: actor.personId,
		target: { pageId: page.id },
		snapshot: {
			...mentionSnapshot({ code: page.pageTag, title: page.title }, actor, body),
			commentId
		},
		recipients: mentioned.map((personId) => ({ personId, type: 'mention' as const })),
		followers: options.followers,
		followerSummary: m.follow_summary_page_comment()
	});
}

/** Oldest first. Archived pages included: staff read what was said, they just cannot add. */
export async function listPageComments(
	viewer: SessionUser,
	pageId: string
): Promise<Outcome<PageCommentView[], 'not_found'>> {
	requirePagesManage(viewer);
	const page = await readablePage(getDb(), viewer, pageId);
	if (!page) return failure('not_found');

	const rows = await getDb()
		.select({
			id: pageComments.id,
			authorPersonId: pageComments.authorPersonId,
			authorName: people.fullName,
			body: pageComments.body,
			createdAt: pageComments.createdAt,
			editedAt: pageComments.editedAt
		})
		.from(pageComments)
		.leftJoin(people, eq(people.id, pageComments.authorPersonId))
		.where(
			and(eq(pageComments.pageId, page.id), eq(pageComments.organisationId, viewer.organisationId))
		)
		.orderBy(asc(pageComments.createdAt), asc(pageComments.id));

	return success(
		rows.map((row) => ({
			...row,
			bodyHtml: renderMarkdown(row.body),
			canEdit:
				page.archivedAt === null &&
				viewer.personId !== null &&
				row.authorPersonId === viewer.personId
		}))
	);
}

function bodyProblem(body: string): 'body_too_long' | 'empty_body' | null {
	const trimmed = body.trim();
	if (trimmed.length === 0) return 'empty_body';
	return trimmed.length > RICH_TEXT_MAX_LENGTH ? 'body_too_long' : null;
}

/**
 * Adds a comment and notifies the staff it names, in one transaction (ADR 0040).
 * Their mails go out after commit, unawaited: with SMTP down the comment is
 * still saved (ADR 0006). Not on an archived page.
 */
export async function addPageComment(
	actor: SessionUser,
	pageId: string,
	body: string,
	deps: PageCommentDeps = {}
): Promise<Outcome<{ commentId: string }, PageCommentFailure>> {
	requirePagesManage(actor);
	const problem = bodyProblem(body);
	if (problem) return failure(problem);
	const text = body.trim();
	const { mailer, origin } = resolveDeps(deps);

	let emails: PendingEmail[] = [];
	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<{ commentId: string }, PageCommentFailure>> => {
			const page = await readablePage(tx, actor, pageId);
			if (!page) return failure('not_found');
			if (page.archivedAt) return failure('page_archived');

			const [comment] = await tx
				.insert(pageComments)
				.values({
					organisationId: actor.organisationId,
					pageId: page.id,
					authorPersonId: actor.personId,
					body: text
				})
				.returning({ id: pageComments.id });

			// Commenting follows the page (#330).
			await autoFollowPage(tx, actor.organisationId, page.id, [actor.personId]);
			emails = await notifyMentioned(tx, actor, page, comment.id, text, extractMentions(text), {
				followers: true
			});
			return success({ commentId: comment.id });
		}
	);

	void sendNotificationEmails(mailer, emails, origin);
	return outcome;
}

/**
 * Edits the text of one's own comment. Only the people the edit newly names are
 * notified; those named before were told once. An unchanged body records nothing.
 */
export async function editPageComment(
	actor: SessionUser,
	commentId: string,
	body: string,
	deps: PageCommentDeps = {}
): Promise<Outcome<void, PageCommentEditFailure>> {
	requirePagesManage(actor);
	const problem = bodyProblem(body);
	if (problem) return failure(problem);
	const text = body.trim();
	const { mailer, origin } = resolveDeps(deps);

	let emails: PendingEmail[] = [];
	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<void, PageCommentEditFailure>> => {
			const [comment] = await tx
				.select()
				.from(pageComments)
				.where(
					and(eq(pageComments.id, commentId), eq(pageComments.organisationId, actor.organisationId))
				)
				.limit(1);
			if (!comment) return failure('not_found');
			const page = await readablePage(tx, actor, comment.pageId);
			if (!page) return failure('not_found');

			if (actor.personId === null || comment.authorPersonId !== actor.personId) {
				return failure('forbidden');
			}
			if (page.archivedAt) return failure('page_archived');
			if (comment.body === text) return success(undefined);

			await tx
				.update(pageComments)
				.set({ body: text, editedAt: new Date() })
				.where(eq(pageComments.id, comment.id));

			emails = await notifyMentioned(
				tx,
				actor,
				page,
				comment.id,
				text,
				addedMentions(comment.body, text),
				{ followers: false }
			);
			return success(undefined);
		}
	);

	void sendNotificationEmails(mailer, emails, origin);
	return outcome;
}
