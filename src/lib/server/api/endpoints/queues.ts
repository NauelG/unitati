import { z } from 'zod';
import { listQueues } from '../../service-desk';
import { defineEndpoint } from '../registry';

export const listQueuesEndpoint = defineEndpoint({
	id: 'queues.list',
	method: 'GET',
	path: '/queues',
	summary: 'List the queues a ticket can be opened in or moved to.',
	permissions: ['tickets.view', 'tickets.create'],
	input: z.object({}),
	output: z.object({ data: z.array(z.object({ id: z.string(), name: z.string() })) }),
	handler: async ({ principal }) => ({
		data: (await listQueues(principal)).map((queue) => ({ id: queue.id, name: queue.name }))
	})
});
