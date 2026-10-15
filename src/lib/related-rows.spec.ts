import { describe, expect, it } from 'vitest';
import type { RelatedItem, ViaTask } from '#lib/server/links/index.js';
import { relatedRows } from './related-rows.js';

const at = new Date('2026-01-01T10:00:00Z');

function task(tag: string): ViaTask {
	return {
		kind: 'task',
		id: `id-${tag}`,
		tag,
		title: tag,
		href: `/tasks/${tag}`,
		status: { group: 'started', name: 'En curso' }
	};
}

function ticket(tag: string, via?: ViaTask): RelatedItem {
	return {
		ref: { kind: 'ticket', id: `id-${tag}`, tag, title: tag, href: `/service-desk/${tag}` },
		status: 'new',
		linkedAt: at,
		...(via ? { via } : {})
	};
}

describe('relatedRows', () => {
	it('keeps a plain group as it is', () => {
		const rows = relatedRows({ items: [ticket('TCK-0001'), ticket('TCK-0002')] });
		expect(rows.map((row) => row.item.ref.tag)).toEqual(['TCK-0001', 'TCK-0002']);
		expect(rows.every((row) => row.vias.length === 0)).toBe(true);
	});

	it('shows a ticket once with every task it arrives through', () => {
		const rows = relatedRows({
			items: [
				ticket('TCK-0001', task('TSK-0001')),
				ticket('TCK-0002', task('TSK-0001')),
				ticket('TCK-0001', task('TSK-0002'))
			]
		});

		expect(rows.map((row) => row.item.ref.tag)).toEqual(['TCK-0001', 'TCK-0002']);
		expect(rows[0].vias.map((via) => via.tag)).toEqual(['TSK-0001', 'TSK-0002']);
		expect(rows[1].vias.map((via) => via.tag)).toEqual(['TSK-0001']);
	});

	it('does not list the same task twice', () => {
		const [row] = relatedRows({
			items: [ticket('TCK-0001', task('TSK-0001')), ticket('TCK-0001', task('TSK-0001'))]
		});
		expect(row.vias).toHaveLength(1);
	});
});
