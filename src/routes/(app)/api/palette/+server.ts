import { json } from '@sveltejs/kit';
import { ASSET_READ_PERMISSIONS, TICKET_READ_PERMISSIONS } from '#lib/domain/access.js';
import type { PaletteRecord } from '#lib/domain/palette.js';
import { can } from '#lib/server/access/permissions.js';
import { listAssets } from '#lib/server/assets/index.js';
import { requireUser } from '#lib/server/auth/guards.js';
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

	const [assets, tickets] = await Promise.all([
		[ASSET_READ_PERMISSIONS].flat().some((permission) => can(user, permission))
			? listAssets(user, { page: 1, perPage: PALETTE_LIMIT, search: query })
			: null,
		[TICKET_READ_PERMISSIONS].flat().some((permission) => can(user, permission))
			? listTickets(user, { page: 1, perPage: PALETTE_LIMIT, search: query })
			: null
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
		})) ?? [])
	];

	return json({ records });
};
