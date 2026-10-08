import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '#lib/server/access/permissions.js';
import { listAssets } from '#lib/server/assets/index.js';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { pageWindowFrom } from '#lib/server/shared/pagination.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Reaching the screen is a capability; which rows and how much of each is
	// decided by `listAssets` from the same viewer (ADR 0007).
	const user = requireAnyPermission(locals.user, ASSET_READ_PERMISSIONS);

	const window = pageWindowFrom(url.searchParams);
	const search = url.searchParams.get('q')?.trim() ?? '';

	const result = await listAssets(user, {
		page: window.page,
		perPage: window.perPage,
		search
	});

	return {
		result,
		search,
		// Drives copy and columns, never access: the rows above are already redacted.
		seesWholeInventory: can(user, 'assets.view'),
		canManage: can(user, 'assets.manage')
	};
};
