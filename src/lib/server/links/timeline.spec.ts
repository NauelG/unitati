import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../activity';
import type { RelatedGroup, RelatedItem } from './related';
import { mergeAssetTimeline, recentTicketCount } from './timeline';

const at = (iso: string) => new Date(iso);

const ASSET = '3f1e0c9a-0000-4000-8000-000000000001';

function note(id: string, occurredAt: string, text = 'Nota'): TimelineEntry {
	return {
		id,
		verb: 'note.added',
		payload: { text },
		occurredAt: at(occurredAt),
		actorPersonId: null,
		actorName: null
	};
}

function ticket(tag: string, linkedAt: string, status: RelatedItem['status'] = 'new'): RelatedItem {
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
	} as RelatedItem;
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

	it('is zero with no ticket group', () => {
		expect(recentTicketCount([], now)).toBe(0);
	});
});
