import { z } from 'zod';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { can } from '#lib/server/access/permissions.js';
import { listStates, listTasks, requireProjectRead } from '#lib/server/projects/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireProjectRead(locals.user);

	const search = url.searchParams.get('q')?.trim() ?? '';
	const group = z.enum(STATE_GROUPS).safeParse(url.searchParams.get('group')).data;

	// "Assigned to me" is the default. "All" is the organisation's work, which
	// only `projects.view` may see: without it the parameter is ignored rather
	// than refused, so a stale link still lands somewhere useful.
	const canSeeAll = can(user, 'projects.view');
	const all = canSeeAll && url.searchParams.get('filter') === 'all';

	// A viewer with no directory record has no assignments to filter by: a
	// task list "assigned to nobody" would be every unassigned task.
	const tasks =
		all || user.personId !== null
			? await listTasks(user, {
					assignee: all ? undefined : (user.personId ?? undefined),
					group,
					q: search
				})
			: [];

	const canManage = can(user, 'projects.manage');

	return {
		tasks,
		search,
		group: group ?? '',
		all,
		canSeeAll,
		canManage,
		// The catalogue feeds the row verb that changes a state.
		states: canManage
			? (await listStates(user)).map(({ id, name, group }) => ({ id, name, group }))
			: []
	};
};
