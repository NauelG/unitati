import { describe, expect, it } from 'vitest';
import type { TicketStatus } from '#lib/domain/status.js';
import type { TimelineEntry } from '../activity';
import type { RelatedGroup, RelatedItem } from './related';
import {
	mergeAssetTimeline,
	mergeProjectTimeline,
	mergeTaskTimeline,
	openTicketCount,
	recentTicketCount
} from './timeline';

const at = (iso: string) => new Date(iso);

const ASSET = '3f1e0c9a-0000-4000-8000-000000000001';

function note(id: string, occurredAt: string, text = 'Nota'): TimelineEntry {
	return {
		id,
		verb: 'note.added',
		payload: { text },
		occurredAt: at(occurredAt),
		actorPersonId: null,
		actorServiceAccountId: null,
		actorName: null
	};
}

function ticket(tag: string, linkedAt: string, status: TicketStatus = 'new'): RelatedItem {
	return {
		ref: {
			kind: 'ticket',
			id: `id-${tag}`,
			tag,
			title: `Solicitud ${tag}`,
			href: `/service-desk/${tag}`
		},
		status,
		linkedAt: at(linkedAt)
	};
}

const tickets = (...items: RelatedItem[]): RelatedGroup[] => [
	{ relation: 'affected_by', icon: 'ticket', items }
];

describe('mergeAssetTimeline', () => {
	it('puts tickets and activity on one rail, newest first', () => {
		const merged = mergeAssetTimeline(
			[note('n1', '2026-03-01T10:00:00Z'), note('n2', '2026-05-01T10:00:00Z')],
			tickets(ticket('TCK-0001', '2026-04-01T10:00:00Z'))
		);

		expect(
			merged.map((item) => (item.kind === 'ticket' ? item.record.tag : item.entry.id))
		).toEqual(['n2', 'TCK-0001', 'n1']);
	});

	it('dates a ticket by when it was linked and shows the status it has today', () => {
		const [item] = mergeAssetTimeline(
			[],
			tickets(ticket('TCK-0007', '2026-02-02T09:00:00Z', 'resolved'))
		);

		expect(item).toMatchObject({
			kind: 'ticket',
			at: at('2026-02-02T09:00:00Z'),
			status: 'resolved',
			record: { kind: 'ticket', tag: 'TCK-0007', href: '/service-desk/TCK-0007' }
		});
	});

	it('is just the activity when nothing is related', () => {
		const merged = mergeAssetTimeline([note('n1', '2026-03-01T10:00:00Z')], []);

		expect(merged.map((item) => item.kind)).toEqual(['activity']);
	});

	it('keeps a stable order when two things share a moment', () => {
		const first = mergeAssetTimeline(
			[note('a', '2026-03-01T10:00:00Z'), note('b', '2026-03-01T10:00:00Z')],
			tickets(ticket('TCK-0001', '2026-03-01T10:00:00Z'))
		);
		const second = mergeAssetTimeline(
			[note('b', '2026-03-01T10:00:00Z'), note('a', '2026-03-01T10:00:00Z')],
			tickets(ticket('TCK-0001', '2026-03-01T10:00:00Z'))
		);

		expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
	});

	it('ignores groups that are not tickets', () => {
		const merged = mergeAssetTimeline(
			[],
			[
				{
					relation: 'affects',
					icon: 'asset',
					items: [
						{
							ref: {
								kind: 'asset',
								id: ASSET,
								tag: 'AST-0001',
								title: 'Portátil',
								href: '/assets/AST-0001'
							},
							status: 'in_use',
							linkedAt: at('2026-03-01T10:00:00Z')
						}
					]
				}
			]
		);

		expect(merged).toEqual([]);
	});
});

describe('recentTicketCount', () => {
	const now = at('2026-10-09T12:00:00Z');

	it('counts the tickets linked in the last six months', () => {
		const groups = tickets(
			ticket('TCK-0001', '2026-09-01T00:00:00Z'),
			ticket('TCK-0002', '2026-05-01T00:00:00Z'),
			ticket('TCK-0003', '2026-04-08T00:00:00Z')
		);

		expect(recentTicketCount(groups, now)).toBe(2);
	});

	it('does not count the ones older than six months', () => {
		const groups = tickets(ticket('TCK-0001', '2025-01-01T00:00:00Z'));

		expect(recentTicketCount(groups, now)).toBe(0);
	});

	// 31 August minus six months is not 3 March. Month arithmetic that lets the
	// day overflow moves the window by days, silently dropping a ticket that was
	// inside it.
	it('keeps the window at the end of a long month, not past it', () => {
		const lateAugust = at('2026-08-31T12:00:00Z');
		const groups = tickets(
			ticket('TCK-0001', '2026-03-01T00:00:00Z'),
			ticket('TCK-0002', '2026-02-20T00:00:00Z')
		);

		expect(recentTicketCount(groups, lateAugust)).toBe(1);
	});

	it('is zero with no ticket group', () => {
		expect(recentTicketCount([], now)).toBe(0);
	});
});

describe('mergeTaskTimeline and mergeProjectTimeline', () => {
	it("merge a task's tickets into its activity the way an asset's are", () => {
		const merged = mergeTaskTimeline(
			[note('n1', '2026-03-01T10:00:00Z')],
			[
				{
					relation: 'resolves',
					icon: 'ticket',
					items: [ticket('TCK-0002', '2026-04-01T10:00:00Z')]
				}
			]
		);

		expect(
			merged.map((item) => (item.kind === 'ticket' ? item.record.tag : item.entry.id))
		).toEqual(['TCK-0002', 'n1']);
	});

	it("keep the task a project's ticket came through", () => {
		const via = {
			kind: 'task' as const,
			id: 'id-TSK-0001',
			tag: 'TSK-0001',
			title: 'Book the van',
			href: '/tasks/TSK-0001',
			status: { group: 'started' as const, name: 'En curso' }
		};
		const reached = { ...ticket('TCK-0003', '2026-04-01T10:00:00Z'), via };

		const [item] = mergeProjectTimeline(
			[],
			[
				{
					relation: 'resolves_via_tasks',
					icon: 'ticket',
					items: [reached]
				}
			]
		);

		expect(item).toMatchObject({ kind: 'ticket', via: { tag: 'TSK-0001' } });
	});

	it('leave a ticket without a via task without one', () => {
		const [item] = mergeProjectTimeline(
			[],
			[{ relation: 'handles', icon: 'ticket', items: [ticket('TCK-0004', '2026-04-01T10:00:00Z')] }]
		);

		expect(item).not.toHaveProperty('via');
	});
});

describe('the actor of a live entry', () => {
	it('is kept on the task rail, even when the person is gone', () => {
		const [named, gone] = mergeTaskTimeline(
			[],
			[
				{
					relation: 'resolves',
					icon: 'ticket',
					items: [
						{ ...ticket('TCK-0005', '2026-04-02T10:00:00Z'), actorName: 'Marta Soler' },
						{ ...ticket('TCK-0006', '2026-04-01T10:00:00Z'), actorName: null }
					]
				}
			]
		);

		expect(named).toMatchObject({ actorName: 'Marta Soler' });
		expect(gone).toMatchObject({ actorName: null });
	});

	it('is absent when the relation was read without it', () => {
		const [item] = mergeTaskTimeline(
			[],
			[
				{
					relation: 'resolves',
					icon: 'ticket',
					items: [ticket('TCK-0007', '2026-04-01T10:00:00Z')]
				}
			]
		);

		expect(item).not.toHaveProperty('actorName');
	});
});

describe('openTicketCount', () => {
	const group = (relation: 'handles' | 'resolves_via_tasks', ...items: RelatedItem[]) => ({
		relation,
		icon: 'ticket' as const,
		items
	});

	it('leaves out resolved and closed tickets', () => {
		expect(
			openTicketCount([
				group(
					'handles',
					ticket('TCK-0001', '2026-04-01T10:00:00Z', 'new'),
					ticket('TCK-0002', '2026-04-01T10:00:00Z', 'waiting_on_user'),
					ticket('TCK-0003', '2026-04-01T10:00:00Z', 'resolved'),
					ticket('TCK-0004', '2026-04-01T10:00:00Z', 'closed')
				)
			])
		).toBe(2);
	});

	it('counts a ticket once when it is handled directly and reached through two tasks', () => {
		const direct = ticket('TCK-0001', '2026-04-01T10:00:00Z', 'in_progress');
		expect(
			openTicketCount([
				group('handles', direct),
				group('resolves_via_tasks', direct, direct, ticket('TCK-0002', '2026-04-01T10:00:00Z'))
			])
		).toBe(2);
	});

	it('is zero with nothing linked', () => {
		expect(openTicketCount([])).toBe(0);
	});
});
