import { and, eq, inArray } from 'drizzle-orm';
import type { SpaceAudience } from '#lib/domain/knowledge.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { readablePages } from './scope';
import { knowledgeSpaces, pages } from './schema';

/**
 * What `links` needs to know about pages (#327), asked through the knowledge
 * scope so `links` never reads a knowledge table (ADR 0002). Both reads start
 * from `readablePages`: a page the viewer cannot read is simply absent from the
 * first, and comes back without its title from the second.
 */

/** A page the actor may read, with what a citation rule decides on. */
export type CitablePage = {
	id: string;
	tag: string;
	title: string;
	/** Published and not archived: the state an employee can read. */
	published: boolean;
	audience: SpaceAudience;
};

/**
 * The pages among `tags` (`DOC-####`, any case) the actor can read: not
 * archived, and drafts only for staff. A tag that is missing, archived or out
 * of scope is absent from the answer, indistinguishable from one another.
 */
export async function readablePagesByTag(
	executor: Executor,
	actor: SessionUser,
	tags: readonly string[]
): Promise<CitablePage[]> {
	if (tags.length === 0 || !can(actor, 'knowledge.view')) return [];

	const rows = await executor
		.select({
			id: pages.id,
			tag: pages.pageTag,
			title: pages.title,
			publishedAt: pages.publishedAt,
			audience: knowledgeSpaces.audience
		})
		.from(pages)
		.innerJoin(knowledgeSpaces, eq(knowledgeSpaces.id, pages.spaceId))
		.where(
			and(
				inArray(
					pages.pageTag,
					tags.map((tag) => tag.trim().toUpperCase())
				),
				readablePages(actor)
			)
		);

	return rows.map((row) => ({
		id: row.id,
		tag: row.tag,
		title: row.title,
		published: row.publishedAt !== null,
		audience: row.audience as SpaceAudience
	}));
}

/** A page as a relation shows it. `title` is empty unless `readable`. */
export type PageSummary = {
	id: string;
	tag: string;
	/** Empty when the viewer cannot read the page: a title can be the secret itself. */
	title: string;
	status: 'draft' | 'published' | 'archived';
	/** Whether the viewer may open it. The code is returned either way (#327). */
	readable: boolean;
};

/**
 * The pages with these ids, in the viewer's organisation. Unlike the other
 * reads this one answers for a page the viewer **cannot** read, with its code
 * only: a citation's code is already in the reply's text (#17 §5), and the
 * caller decides what to do with an unreadable one. Staff also read archived
 * pages here, because that is what a citation of a since-archived page is.
 */
export async function pageSummaries(
	viewer: SessionUser,
	ids: readonly string[]
): Promise<PageSummary[]> {
	if (ids.length === 0) return [];

	const rows = await getDb()
		.select({
			id: pages.id,
			tag: pages.pageTag,
			title: pages.title,
			publishedAt: pages.publishedAt,
			archivedAt: pages.archivedAt
		})
		.from(pages)
		.where(and(eq(pages.organisationId, viewer.organisationId), inArray(pages.id, [...ids])));

	const readable = can(viewer, 'knowledge.view')
		? new Set(
				(
					await getDb()
						.select({ id: pages.id })
						.from(pages)
						.where(
							and(
								inArray(
									pages.id,
									rows.map((row) => row.id)
								),
								readablePages(viewer, { includeArchived: true })
							)
						)
				).map((row) => row.id)
			)
		: new Set<string>();

	return rows.map((row) => ({
		id: row.id,
		tag: row.tag,
		title: readable.has(row.id) ? row.title : '',
		status: row.archivedAt ? 'archived' : row.publishedAt ? 'published' : 'draft',
		readable: readable.has(row.id)
	}));
}
