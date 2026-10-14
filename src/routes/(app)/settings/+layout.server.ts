import { requireSettingsAccess } from '#lib/server/settings/guard.js';
import type { LayoutServerLoad } from './$types';

/**
 * Every page under `/settings` needs at least one section the viewer may manage;
 * each section's page and actions then check their own permission. The
 * sections themselves are not sent: the client derives them from the registry
 * and the `permissions` the `(app)` layout already ships.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	requireSettingsAccess(locals.user);
	return {};
};
