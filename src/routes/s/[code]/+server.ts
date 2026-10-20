import { error, redirect } from '@sveltejs/kit';
import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '#lib/server/access/permissions.js';
import { getAssetByTag } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/**
 * CONTRACT (ADR 0038): printed labels encode `{origin}/s/{tag}`. This path and
 * its parameter must never change, because a label outlives every release.
 * What it does for a signed-in visitor is decided here; #23 owns the
 * not-signed-in branch (today: the login screen, which returns here).
 */
export const GET: RequestHandler = async ({ locals, params, url, setHeaders }) => {
	// The answer depends on the session, so no cache may keep it.
	setHeaders({ 'Cache-Control': 'no-store' });

	const user = locals.user;
	if (!user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);

	// Same 404 as a missing asset: never confirm that a tag exists.
	if (!ASSET_READ_PERMISSIONS.some((permission) => can(user, permission))) {
		error(404, 'Not found');
	}

	const found = await getAssetByTag(user, params.code);
	if (!found.ok) error(404, 'Not found');

	redirect(303, `/assets/${encodeURIComponent(found.value.assetTag)}`);
};
