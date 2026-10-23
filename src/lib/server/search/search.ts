import { sql } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { assetHits } from '../assets';
import { personHits } from '../directory';
import { pageHits } from '../knowledge';
import { relatedTo } from '../links';
import { projectHits, taskHits } from '../projects';
import { parseSearchTerm, type SearchHitKind } from '../shared/search-hits';
import { ticketHits } from '../service-desk';

/**
 * Global search (#12): one query over every record, grouped in the design
 * system's fixed order, five per group.
 *
 * **This module owns the composition and nothing else.** Each domain builds its
 * own sub-query over its own tables, carrying its own permission scope
 * (ADR 0002); here they are joined with `UNION ALL`, ranked, grouped and limited
 * — all in the one statement. The scope is therefore in the query, not after it,
 * and the `total` of every group counts only what the viewer may see. A
 * post-filtered search leaks totals: "47 results" of which 3 render tells an
 * employee how many machines the company owns.
 */

/** At most this many hits per group. */
const GROUP_LIMIT = 5;

/**
 * In the design system's order. `asset_tickets` is not a query group: it is the
 * tickets of the top asset, appended right after `assets`.
 */
export type SearchGroupKey =
	'code' | 'assets' | 'asset_tickets' | 'tickets' | 'projects' | 'pages' | 'people';

const QUERY_GROUPS = ['code', 'assets', 'tickets', 'projects', 'pages', 'people'] as const;

export interface SearchHit {
	kind: SearchHitKind;
	/** The human code (ADR 0010); `null` for a person. */
	code: string | null;
	title: string;
	subtitle: string | null;
	href: string;
}

export interface SearchGroup {
	key: SearchGroupKey;
	hits: SearchHit[];
	/** How many records matched in this group, counting only what the viewer may see. */
	total: number;
}

export interface SearchResult {
	groups: SearchGroup[];
}

interface SearchRow extends Record<string, unknown> {
	kind: SearchHitKind;
	id: string;
	code: string | null;
	title: string;
	subtitle: string | null;
	rank: number;
	grp: (typeof QUERY_GROUPS)[number];
	total: number;
}

function hrefOf(kind: SearchHitKind, code: string | null): string {
	switch (kind) {
		case 'asset':
			return `/assets/${encodeURIComponent(code ?? '')}`;
		case 'ticket':
			return `/service-desk/${encodeURIComponent(code ?? '')}`;
		case 'project':
			return `/projects/${encodeURIComponent(code ?? '')}`;
		case 'task':
			return `/tasks/${encodeURIComponent(code ?? '')}`;
		case 'page':
			// An employee is redirected to the portal reader by the canonical link.
			return `/knowledge/${encodeURIComponent(code ?? '')}`;
		case 'person':
			// There is no person page yet: the directory is the place to find them.
			return '/directory';
	}
}

const toHit = (row: Pick<SearchRow, 'kind' | 'code' | 'title' | 'subtitle'>): SearchHit => ({
	kind: row.kind,
	code: row.code,
	title: row.title,
	subtitle: row.subtitle,
	href: hrefOf(row.kind, row.code)
});

export async function search(viewer: SessionUser, input: string): Promise<SearchResult> {
	const term = parseSearchTerm(input);
	if (!term) return { groups: [] };

	const parts = [
		assetHits(viewer, term),
		ticketHits(viewer, term),
		projectHits(viewer, term),
		taskHits(viewer, term),
		pageHits(viewer, term),
		personHits(viewer, term)
	].filter((part) => part !== null);
	if (parts.length === 0) return { groups: [] };

	// Each part is a typed select over its own table. Their shapes agree by
	// construction (`SearchHitKind` and the aliases), but the builders' table
	// generics differ, which `unionAll` refuses; joining the SQL says the same thing.
	const union = sql.join(
		parts.map((part) => sql`(${part})`),
		sql` union all `
	);

	// `exact` hits are pulled into their own group, so a code never shows twice.
	const rows = await getDb().execute<SearchRow>(sql`
		with hits as (${union}),
		grouped as (
			select *,
				case
					when exact then 'code'
					when kind = 'asset' then 'assets'
					when kind = 'ticket' then 'tickets'
					when kind in ('project', 'task') then 'projects'
					when kind = 'page' then 'pages'
					else 'people'
				end as grp
			from hits
		),
		ranked as (
			select *,
				row_number() over (partition by grp order by rank desc, code nulls last, title) as rn,
				(count(*) over (partition by grp))::int as total
			from grouped
		)
		select kind, id, code, title, subtitle, rank, grp, total
		from ranked
		where rn <= ${GROUP_LIMIT}
		order by rank desc, code nulls last, title
	`);

	const groups: SearchGroup[] = [];
	for (const key of QUERY_GROUPS) {
		const inGroup = rows.filter((row) => row.grp === key);
		if (inGroup.length === 0) continue;
		groups.push({ key, hits: inGroup.map(toHit), total: inGroup[0].total });
	}

	// The relation is the point: when the top hit is an asset, show what has gone
	// wrong with it. Read through `links`, which scopes the other side itself.
	const top = [...rows].sort((a, b) => b.rank - a.rank)[0];
	if (top?.kind === 'asset') {
		const related = await relatedTo(viewer, { kind: 'asset', id: top.id });
		const items = related.find((found) => found.relation === 'affected_by')?.items ?? [];
		if (items.length > 0) {
			const assetsAt = groups.findIndex((found) => found.key === 'assets' || found.key === 'code');
			groups.splice(assetsAt + 1, 0, {
				key: 'asset_tickets',
				total: items.length,
				hits: items.slice(0, GROUP_LIMIT).map((item) =>
					toHit({
						kind: 'ticket',
						code: item.ref.tag,
						title: item.ref.title,
						subtitle: null
					})
				)
			});
		}
	}

	return { groups };
}
