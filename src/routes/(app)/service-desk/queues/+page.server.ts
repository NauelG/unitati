import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	createQueue,
	deleteQueue,
	listQueues,
	renameQueue
} from '#lib/server/service-desk/index.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	const queues = await listQueues(user);
	return { queues: queues.map(({ id, name }) => ({ id, name })) };
};

const named = z.object({ name: z.string().trim().min(1) });
const withId = z.object({ id: z.uuid() });

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = named.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('create', m.queues_error_invalid());

		const outcome = await createQueue(user, parsed.data);
		if (!outcome.ok) return rejected('create', failureMessage(outcome.error));
		return { action: 'create' as const };
	},

	rename: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const parsed = named.safeParse(fields);
		if (!id.success || !parsed.success) return rejected('rename', m.queues_error_invalid());

		const outcome = await renameQueue(user, id.data.id, parsed.data);
		if (!outcome.ok) return rejected('rename', failureMessage(outcome.error), id.data.id);
		return { action: 'rename' as const };
	},

	delete: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.queues_error_not_found());

		const outcome = await deleteQueue(user, id.data.id);
		if (!outcome.ok) return rejected('delete', failureMessage(outcome.error), id.data.id);
		return { action: 'delete' as const };
	}
};
