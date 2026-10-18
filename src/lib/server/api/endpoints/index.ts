import type { Endpoint } from '../registry';
import { ASSET_ENDPOINTS } from './assets';
import { LOCATION_ENDPOINTS } from './locations';
import { PROJECT_ENDPOINTS } from './projects';
import { listQueuesEndpoint } from './queues';
import { listStatesEndpoint } from './states';
import { TASK_ENDPOINTS } from './tasks';
import { TICKET_ACTION_ENDPOINTS } from './ticket-actions';
import { TICKET_WORK_ENDPOINTS } from './ticket-work';
import { commentEndpoint, ticketThreadEndpoint } from './ticket-thread';
import { getTicketEndpoint, listTicketsEndpoint } from './tickets';

/**
 * Every endpoint the API serves. Later slices add to this list and nothing
 * else: dispatch, authorisation and documentation all read it.
 */
export const ENDPOINTS: readonly Endpoint[] = [
	listTicketsEndpoint,
	getTicketEndpoint,
	ticketThreadEndpoint,
	commentEndpoint,
	...TICKET_ACTION_ENDPOINTS,
	...TICKET_WORK_ENDPOINTS,
	listQueuesEndpoint,
	...ASSET_ENDPOINTS,
	...LOCATION_ENDPOINTS,
	...PROJECT_ENDPOINTS,
	...TASK_ENDPOINTS,
	listStatesEndpoint
];
