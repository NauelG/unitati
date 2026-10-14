import type { Endpoint } from '../registry';
import { getTicketEndpoint, listTicketsEndpoint } from './tickets';

/**
 * Every endpoint the API serves. Later slices add to this list and nothing
 * else: dispatch, authorisation and documentation all read it.
 */
export const ENDPOINTS: readonly Endpoint[] = [listTicketsEndpoint, getTicketEndpoint];
