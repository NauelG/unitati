import { z } from 'zod';
import { can } from '#lib/server/access/permissions.js';
import {
	listProjects,
	projectProgressMany,
	requireProjectRead
} from '#lib/server/projects/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Reaching the screen is a capability; which projects appear is decided by
	// `listProjects` from the same viewer (ADR 0007).
	const user = requireProjectRead(locals.user);

	const search = url.searchParams.get('q')?.trim() ?? '';
	const archived = z.literal('archived').safeParse(url.searchParams.get('filter')).success;

	const projects = await listProjects(user, { archived, q: search });
	const progress = await projectProgressMany(
		user,
		projects.map((project) => project.id)
	);

	return {
		projects: projects.map((project) => ({ ...project, counts: progress[project.id] })),
		search,
		archived,
		canManage: can(user, 'projects.manage')
	};
};
