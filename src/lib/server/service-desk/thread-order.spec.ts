import { describe, expect, it } from 'vitest';
import { compareThreadItems } from './thread-order';
import type { ThreadItem } from './comments';

const T0 = new Date('2026-10-18T10:00:00.000Z');
const T1 = new Date('2026-10-18T10:05:00.000Z');

const event = (id: string, verb: string, at: Date) =>
	({ kind: 'event', at, entry: { id, verb, occurredAt: at } }) as unknown as ThreadItem;

const comment = (id: string, createdAt: Date) =>
	({ kind: 'comment', id, createdAt }) as unknown as ThreadItem;

const label = (item: ThreadItem) => (item.kind === 'comment' ? 'comment' : item.entry.verb);

const shuffles = <T>(items: T[]): T[][] =>
	items.length <= 1
		? [items]
		: items.flatMap((item, index) =>
				shuffles([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
					item,
					...rest
				])
			);

describe('compareThreadItems', () => {
	it('puts ticket.created, then the comment, then other events when timestamps are equal', () => {
		const items = [
			event('b', 'link.asset.added', T0),
			comment('a', T0),
			event('z', 'ticket.created', T0)
		];

		for (const input of shuffles(items)) {
			expect([...input].sort(compareThreadItems).map(label)).toEqual([
				'ticket.created',
				'comment',
				'link.asset.added'
			]);
		}
	});

	it('keeps chronological order when timestamps differ', () => {
		const late = event('a', 'ticket.created', T1);
		const early = event('z', 'link.asset.added', T0);

		expect([late, early].sort(compareThreadItems)).toEqual([early, late]);
	});

	it('orders two other events with the same time by id', () => {
		const first = event('1', 'link.asset.added', T0);
		const second = event('2', 'link.asset.added', T0);

		expect([second, first].sort(compareThreadItems)).toEqual([first, second]);
	});

	it('orders two comments with the same time by id', () => {
		const first = comment('1', T0);
		const second = comment('2', T0);

		expect([second, first].sort(compareThreadItems)).toEqual([first, second]);
	});
});
