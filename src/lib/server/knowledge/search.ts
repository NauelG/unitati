import { and, desc, eq, sql } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { plainExcerpt } from '../shared/markdown';
import { readablePages, requireSpaceScope } from './scope';
import { knowledgeSpaces, pages } from './schema';

const EXCERPT_LENGTH = 200;

export type PageHit = { tag: string; title: string; spaceName: string; excerpt: string };

/**
 * Full-text search over the pages the viewer may read (#328). The scope is part
 * of the query (ADR 0028): a draft, an archived page or a `staff` page is not
 * filtered out afterwards, it never matches, so nothing about it (not even how
 * many there were) reaches an employee.
 *
 * Matches title, body and code through `pages.search`, ranked by relevance. The
 * words are typed by a person, so `websearch_to_tsquery` (which never throws on
 * stray operators) and `immutable_unaccent` on both sides, like the ticket search.
 */
export async function searchPages(
	viewer: SessionUser,
	query: string,
	options: { limit: number; spaceId?: string }
): Promise<PageHit[]> {
	// Before the empty-query shortcut, so a route that forgot its guard fails loudly.
	requireSpaceScope(viewer);

	const text = query.trim();
	if (text === '') return [];

	const tsquery = sql`websearch_to_tsquery('spanish', immutable_unaccent(${text}))`;
	const rows = await getDb()
		.select({
			tag: pages.pageTag,
			title: pages.title,
			body: pages.body,
			spaceName: knowledgeSpaces.name
		})
		.from(pages)
		.innerJoin(knowledgeSpaces, eq(knowledgeSpaces.id, pages.spaceId))
		.where(
			and(
				readablePages(viewer),
				options.spaceId ? eq(pages.spaceId, options.spaceId) : undefined,
				sql`${pages.search} @@ ${tsquery}`
			)
		)
		.orderBy(desc(sql`ts_rank(${pages.search}, ${tsquery})`), pages.pageTag)
		.limit(options.limit);

	return rows.map((row) => ({
		tag: row.tag,
		title: row.title,
		spaceName: row.spaceName,
		excerpt: plainExcerpt(row.body, EXCERPT_LENGTH)
	}));
}
