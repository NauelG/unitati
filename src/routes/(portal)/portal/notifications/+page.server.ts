import { requireUser } from '#lib/server/auth/guards.js';
import { inboxActions, loadInbox } from '../../../notifications/actions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) =>
	loadInbox(requireUser(locals.user, url), url);

export const actions = inboxActions;
