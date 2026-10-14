import type { Endpoint } from '../registry';
import { listQueuesEndpoint } from './queues';
import { TICKET_ACTION_ENDPOINTS } from './ticket-actions';
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
	listQueuesEndpoint
];
