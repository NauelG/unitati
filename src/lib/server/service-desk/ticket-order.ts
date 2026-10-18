/**
 * The ordering of the staff ticket list (#187). The table never reorders rows
 * itself (`DataTable`), so the URL carries `?sort=<key>&dir=asc|desc` and the
 * query orders. Only a closed set of keys is sortable: the value comes from a
 * query string.
 */
export const TICKET_SORT_KEYS = ['status', 'priority', 'updatedAt'] as const;

export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number];

export interface TicketOrder {
	key: TicketSortKey;
	direction: 'asc' | 'desc';
}

/** Time since the last touch is the first thing a desk scans for. */
export const DEFAULT_TICKET_ORDER: TicketOrder = { key: 'updatedAt', direction: 'desc' };

export function parseTicketOrder(params: URLSearchParams): TicketOrder {
	const key = TICKET_SORT_KEYS.find((candidate) => candidate === params.get('sort'));
	if (!key) return DEFAULT_TICKET_ORDER;
	return { key, direction: params.get('dir') === 'desc' ? 'desc' : 'asc' };
}
