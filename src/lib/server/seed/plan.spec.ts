import { describe, expect, it } from 'vitest';
import { assetTagFor, buildPlan, emailFor } from './plan';

describe('buildPlan', () => {
	it('is the same plan every time for the same seed', () => {
		expect(buildPlan(200, 7)).toEqual(buildPlan(200, 7));
	});

	it('is a different plan for a different seed', () => {
		expect(buildPlan(200, 7).assets).not.toEqual(buildPlan(200, 8).assets);
	});

	it('numbers its assets AST-0001 onwards, with no gaps and no repeats', () => {
		const tags = buildPlan(200).assets.map((asset) => asset.assetTag);

		expect(tags[0]).toBe('AST-0001');
		expect(tags.at(-1)).toBe('AST-0200');
		expect(new Set(tags).size).toBe(200);
	});

	it('does not let asset N depend on how many assets come before the cut', () => {
		// The draws are made for every asset whether or not they are used, so
		// asking for fewer assets yields the same first assets.
		expect(buildPlan(50).assets).toEqual(buildPlan(200).assets.slice(0, 50));
	});

	it('never repeats a serial, and leaves some assets without one', () => {
		const serials = buildPlan(200).assets.map((asset) => asset.serial);
		const present = serials.filter((value): value is string => value !== null);

		expect(new Set(present).size).toBe(present.length);
		expect(present.length).toBeLessThan(serials.length);
	});

	it('includes an accented model, so unaccented search has something to prove', () => {
		expect(buildPlan().models.map((model) => model.name)).toContain('MacBook Pró 14');
	});

	it('makes the printers shared, and nothing else', () => {
		const plan = buildPlan(200);

		for (const asset of plan.assets) {
			expect(asset.shared).toBe(plan.models[asset.model].category === 'Printers');
		}
		expect(plan.assets.some((asset) => asset.shared)).toBe(true);
	});

	it('never hands a shared asset to a person', () => {
		const plan = buildPlan(200);

		for (const asset of plan.assets.filter((candidate) => candidate.shared)) {
			expect(asset.events.some((event) => event.kind === 'assign')).toBe(false);
		}
	});

	it('only refers to people, models and locations that exist in the plan', () => {
		const plan = buildPlan(200);
		const emails = new Set(plan.people.map((person) => person.email));
		const locations = new Set(plan.locations);

		for (const asset of plan.assets) {
			expect(plan.models[asset.model]).toBeDefined();
			if (asset.location) expect(locations.has(asset.location)).toBe(true);
			for (const event of asset.events) {
				if (event.kind === 'assign') expect(emails.has(event.personEmail)).toBe(true);
				if (event.kind === 'move' && event.location) {
					expect(locations.has(event.location)).toBe(true);
				}
			}
		}
	});
});

describe('emailFor / assetTagFor', () => {
	it('writes ASCII addresses even for accented or hyphenated names', () => {
		expect(emailFor('Tim Berners-Lee')).toBe('tim.berners.lee@acme.test');
		expect(emailFor('Josep Pla Casadevall')).toBe('josep.pla.casadevall@acme.test');
		expect(emailFor('Núria Sánchez')).toBe('nuria.sanchez@acme.test');
	});

	it('pads tags to four digits', () => {
		expect(assetTagFor(7)).toBe('AST-0007');
		expect(assetTagFor(1234)).toBe('AST-1234');
	});
});
