import { z } from 'zod';
import { DEFAULT_CATALOGUE_COLOR, CATALOGUE_COLORS } from '#lib/domain/catalogue-color.js';
import { m } from '#lib/paraglide/messages.js';
import {
	createQueue,
	deleteQueue,
	listQueues,
	renameQueue
} from '#lib/server/service-desk/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/service-desk/queues';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const queues = await listQueues(user);
	return { queues: queues.map(({ id, name, color }) => ({ id, name, color })) };
};

const named = z.object({
	name: z.string().trim().min(1),
	color: z.enum(CATALOGUE_COLORS).default(DEFAULT_CATALOGUE_COLOR)
});
const withId = z.object({ id: z.uuid() });

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = named.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('create', m.queues_error_invalid());

		const outcome = await createQueue(user, parsed.data);
		if (!outcome.ok) return rejected('create', failureMessage(outcome.error));
		return { action: 'create' as const, message: null, id: null };
	},

	rename: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const parsed = named.safeParse(fields);
		if (!id.success || !parsed.success) return rejected('rename', m.queues_error_invalid());

		const outcome = await renameQueue(user, id.data.id, parsed.data);
		if (!outcome.ok) return rejected('rename', failureMessage(outcome.error), id.data.id);
		return { action: 'rename' as const, message: null, id: null };
	},

	delete: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.queues_error_not_found());

		const outcome = await deleteQueue(user, id.data.id);
		if (!outcome.ok) return rejected('delete', failureMessage(outcome.error), id.data.id);
		return { action: 'delete' as const, message: null, id: null };
	}
};
