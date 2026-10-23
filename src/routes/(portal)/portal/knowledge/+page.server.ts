import { listSpaces, searchPages } from '#lib/server/knowledge/index.js';
import { requirePortalReader } from './reader';
import type { PageServerLoad } from './$types';

const RESULT_LIMIT = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePortalReader(locals.user, url);

	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const [spaces, results] = await Promise.all([
		listSpaces(user),
		query === '' ? null : searchPages(user, query, { limit: RESULT_LIMIT })
	]);

	return {
		query,
		results,
		spaces: spaces.map(({ id, name, description, icon, colour, pageCount }) => ({
			id,
			name,
			description,
			icon,
			colour,
			pageCount
		}))
	};
};
