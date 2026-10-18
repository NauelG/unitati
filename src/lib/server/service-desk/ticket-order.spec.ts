import { describe, expect, it } from 'vitest';
import { DEFAULT_TICKET_ORDER, parseTicketOrder } from './ticket-order';

const params = (query: string) => new URLSearchParams(query);

describe('parseTicketOrder', () => {
	it('defaults to the most recently touched ticket first', () => {
		expect(parseTicketOrder(params(''))).toEqual({ key: 'updatedAt', direction: 'desc' });
		expect(DEFAULT_TICKET_ORDER).toEqual({ key: 'updatedAt', direction: 'desc' });
	});

	it('reads a sortable column and a direction', () => {
		expect(parseTicketOrder(params('sort=status&dir=asc'))).toEqual({
			key: 'status',
			direction: 'asc'
		});
		expect(parseTicketOrder(params('sort=priority&dir=desc'))).toEqual({
			key: 'priority',
			direction: 'desc'
		});
	});

	it('sorts ascending when only the column is given', () => {
		expect(parseTicketOrder(params('sort=updatedAt'))).toEqual({
			key: 'updatedAt',
			direction: 'asc'
		});
	});

	it('falls back to the default for a column that is not sortable', () => {
		expect(parseTicketOrder(params('sort=subject&dir=asc'))).toEqual(DEFAULT_TICKET_ORDER);
	});

	it('ignores an unknown direction', () => {
		expect(parseTicketOrder(params('sort=status&dir=sideways'))).toEqual({
			key: 'status',
			direction: 'asc'
		});
	});
});
