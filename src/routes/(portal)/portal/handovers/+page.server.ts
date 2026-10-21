import { requirePermission } from '#lib/server/auth/guards.js';
import { listOwnHandovers } from '#lib/server/assets/index.js';
import type { PageServerLoad } from './$types';

/** An employee's own handovers. Signing stays on the emailed link: one mechanism (ADR 0035). */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'assets.view.own');
	return { handovers: await listOwnHandovers(user) };
};
