import { json } from '@sveltejs/kit';
import {
	ASSET_READ_PERMISSIONS,
	PROJECT_READ_PERMISSIONS,
	TICKET_READ_PERMISSIONS
} from '#lib/domain/access.js';
import type { PaletteRecord } from '#lib/domain/palette.js';
import { can } from '#lib/server/access/permissions.js';
import { listAssets } from '#lib/server/assets/index.js';
import { requireUser, type SessionUser } from '#lib/server/auth/guards.js';
import { getProject, getTask, listProjects, listTasks } from '#lib/server/projects/index.js';
import { listTickets } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/**
 * The palette's interim "Registros" group (#88). A prefix search over the
 * two record domains the viewer can read, capped at 5 each — org-scoped and
 * permission-scoped by reusing each domain's own `list*` query rather than
 * building a second search path. MVP slice 7 (Postgres FTS) swaps what runs
 * inside this handler; `CommandPalette` only ever sees this response shape,
 * so that swap never touches the component.
 */

const PALETTE_LIMIT = 5;

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const query = url.searchParams.get('q')?.trim() ?? '';

	if (query.length === 0) return json({ records: [] satisfies PaletteRecord[] });

	const seesProjects = PROJECT_READ_PERMISSIONS.some((permission) => can(user, permission));

	const [assets, tickets, projects, tasks] = await Promise.all([
		[ASSET_READ_PERMISSIONS].flat().some((permission) => can(user, permission))
			? listAssets(user, { page: 1, perPage: PALETTE_LIMIT, search: query })
			: null,
		[TICKET_READ_PERMISSIONS].flat().some((permission) => can(user, permission))
			? listTickets(user, { page: 1, perPage: PALETTE_LIMIT, search: query })
			: null,
		seesProjects ? findProjects(user, query) : [],
		seesProjects ? findTasks(user, query) : []
	]);

	const records: PaletteRecord[] = [
		...(assets?.rows.map((row): PaletteRecord => ({
			kind: 'asset',
			tag: row.assetTag,
			title: row.name,
			href: `/assets/${encodeURIComponent(row.assetTag)}`
		})) ?? []),
		...(tickets?.rows.map((row): PaletteRecord => ({
			kind: 'ticket',
			tag: row.ticketTag,
			title: row.subject,
			href: `/service-desk/${encodeURIComponent(row.ticketTag)}`
		})) ?? []),
		...projects.map((row): PaletteRecord => ({
			kind: 'project',
			tag: row.projectTag,
			title: row.name,
			href: `/projects/${encodeURIComponent(row.projectTag)}`
		})),
		...tasks.map((row): PaletteRecord => ({
			kind: 'task',
			tag: row.taskTag,
			title: row.title,
			href: `/tasks/${encodeURIComponent(row.taskTag)}`
		}))
	];

	return json({ records });
};

/**
 * A project or task by its code (`TSK-0001`) as well as by its words: the code
 * is not part of the full-text vector, and typing it is how a technician jumps to
 * a record they were just told about. Both lookups go through the domain, so the
 * viewer's scope applies to an exact code exactly as it does to a search.
 */
async function byCodeOrWords<T extends { id: string }>(
	byCode: Promise<{ ok: true; value: T } | { ok: false }>,
	byWords: Promise<T[]>
): Promise<T[]> {
	const [code, words] = await Promise.all([byCode, byWords]);
	return dedupe([...(code.ok ? [code.value] : []), ...words], (row) => row.id).slice(
		0,
		PALETTE_LIMIT
	);
}

const findProjects = (user: SessionUser, query: string) =>
	byCodeOrWords(getProject(user, query), listProjects(user, { q: query }));

const findTasks = (user: SessionUser, query: string) =>
	byCodeOrWords(getTask(user, query), listTasks(user, { q: query }));

function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
	return rows.filter((row, index) => rows.findIndex((other) => key(other) === key(row)) === index);
}
