import { describe, expect, it } from 'vitest';
import { MIN_GAP, placeBetween, spread, STEP } from './position';

describe('placeBetween', () => {
	it('starts an empty column at one step', () => {
		expect(placeBetween(null, null)).toEqual({ position: STEP });
	});

	it('goes one step past the last task when nothing follows', () => {
		expect(placeBetween(3000, null)).toEqual({ position: 3000 + STEP });
	});

	it('goes one step before the first task when nothing precedes', () => {
		expect(placeBetween(null, 1000)).toEqual({ position: 1000 - STEP });
	});

	it('lands on the midpoint between two neighbours', () => {
		expect(placeBetween(1000, 2000)).toEqual({ position: 1500 });
		expect(placeBetween(1000, 1500)).toEqual({ position: 1250 });
	});

	it('still splits a gap just above the threshold', () => {
		const placed = placeBetween(1, 1 + 2 * MIN_GAP);

		expect('position' in placed && placed.position).toBeCloseTo(1 + MIN_GAP, 9);
	});

	it('asks for a renumber once the gap falls below the threshold', () => {
		expect(placeBetween(1, 1 + MIN_GAP / 2)).toEqual({ renumber: true });
	});

	it('asks for a renumber when two neighbours share a position', () => {
		expect(placeBetween(5, 5)).toEqual({ renumber: true });
	});

	it('survives being halved repeatedly until it has to renumber', () => {
		let upper = 2000;
		let renumbered = false;

		for (let i = 0; i < 60 && !renumbered; i += 1) {
			const placed = placeBetween(1000, upper);
			if ('renumber' in placed) renumbered = true;
			else upper = placed.position;
		}

		expect(renumbered).toBe(true);
	});
});

describe('spread', () => {
	it('numbers a column in steps, in order', () => {
		expect(spread(3)).toEqual([STEP, 2 * STEP, 3 * STEP]);
	});

	it('is empty for an empty column', () => {
		expect(spread(0)).toEqual([]);
	});
});

describe('many inserts between the same two siblings', () => {
	it('keeps a strict order, renumbering when the gap collapses', () => {
		let order: number[] = spread(2);
		// Always insert right after the first sibling: the gap halves each time.
		for (let i = 0; i < 200; i += 1) {
			let placed = placeBetween(order[0], order[1]);
			if ('renumber' in placed) {
				order = spread(order.length);
				placed = placeBetween(order[0], order[1]);
			}
			if (!('position' in placed)) throw new Error('A renumbered list always has room.');
			order = [order[0], placed.position, ...order.slice(1)];
		}

		expect(order).toHaveLength(202);
		for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]);
	});
});
