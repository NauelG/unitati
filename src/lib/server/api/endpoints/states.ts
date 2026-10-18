import { z } from 'zod';
import { listStates } from '../../projects';
import { defineEndpoint } from '../registry';
import { PROJECT_READS, stateSchema } from './project-wire';

/**
 * The state catalogue, read only. Writing it is configuration
 * (`/settings/projects/states`), not a use case an integration drives; reading
 * it is needed because a task cannot be moved without the target's id.
 */
export const listStatesEndpoint = defineEndpoint({
	id: 'states.list',
	method: 'GET',
	path: '/states',
	summary: 'List the task states of the organisation.',
	description:
		"Returns the organisation's task states in board order: state group first (`backlog`, `unstarted`, `started`, `completed`, `cancelled`), then `position`. The `group` is the product's and the `name` is the organisation's, so integrations should rely on the group. Take the `id` from here to create a task in a state or to move one.",
	permissions: PROJECT_READS,
	input: z.object({}),
	output: z.object({ data: z.array(stateSchema) }),
	handler: async ({ principal }) => {
		const rows = await listStates(principal);
		return {
			data: rows.map(({ id, name, group, position }) => ({ id, name, group, position }))
		};
	}
});
