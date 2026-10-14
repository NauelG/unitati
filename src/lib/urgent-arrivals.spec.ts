import { describe, expect, it } from 'vitest';
import { createUrgentArrivals } from './urgent-arrivals.js';

type Row = { tag: string; priority: string };
const row = (tag: string, priority = 'normal'): Row => ({ tag, priority });

function arrivals() {
	return createUrgentArrivals<Row>({
		key: (r) => r.tag,
		isUrgent: (r) => r.priority === 'urgent' || r.priority === 'high'
	});
}

describe('urgent arrivals', () => {
	it('never flags anything on the first list it sees (initial page load)', () => {
		const tracker = arrivals();
		expect(tracker.observe([row('TCK-1', 'urgent'), row('TCK-2', 'high')])).toEqual(new Set());
	});

	it('flags an urgent row that was not in the previous list', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1')]);
		expect(tracker.observe([row('TCK-1'), row('TCK-2', 'urgent')])).toEqual(new Set(['TCK-2']));
	});

	it('treats high like urgent: the existing vocabulary decides', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1')]);
		expect(tracker.observe([row('TCK-3', 'high'), row('TCK-1')])).toEqual(new Set(['TCK-3']));
	});

	it('does not flag a non-urgent arrival', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1')]);
		expect(tracker.observe([row('TCK-1'), row('TCK-2', 'low')])).toEqual(new Set());
	});

	it('does not flag an urgent row that was already there', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1', 'urgent')]);
		expect(tracker.observe([row('TCK-1', 'urgent')])).toEqual(new Set());
	});

	it('flags a row that becomes urgent in place, once, then never again', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1')]);
		expect(tracker.observe([row('TCK-1', 'urgent')])).toEqual(new Set(['TCK-1']));
		expect(tracker.observe([row('TCK-1', 'urgent')])).toEqual(new Set());
	});

	it('flags again a row that left the list and came back urgent', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1', 'urgent')]);
		tracker.observe([]);
		expect(tracker.observe([row('TCK-1', 'urgent')])).toEqual(new Set(['TCK-1']));
	});

	it('treats a change of scope (another filter or page) as a new list, not an arrival', () => {
		const tracker = arrivals();
		tracker.observe([row('TCK-1')], 'page=1');
		expect(tracker.observe([row('TCK-9', 'urgent')], 'page=2')).toEqual(new Set());
		expect(tracker.observe([row('TCK-9', 'urgent'), row('TCK-8', 'urgent')], 'page=2')).toEqual(
			new Set(['TCK-8'])
		);
	});
});
