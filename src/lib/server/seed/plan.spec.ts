import { describe, expect, it } from 'vitest';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { assetTagFor, buildPlan, buildProjectsPlan, emailFor } from './plan';

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
		const locations = new Set(plan.locations.map((location) => location.path));

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

describe('buildProjectsPlan', () => {
	const plan = buildProjectsPlan();
	const tasks = plan.projects.flatMap((project) => project.tasks);

	it('is the same plan every time', () => {
		expect(buildProjectsPlan()).toEqual(plan);
	});

	it('has three projects, one of them archived', () => {
		expect(plan.projects).toHaveLength(3);
		expect(plan.projects.filter((project) => project.archived)).toHaveLength(1);
	});

	it('puts at least one task in every state group, so every default state is occupied', () => {
		for (const group of STATE_GROUPS) {
			expect(tasks.some((task) => task.group === group)).toBe(true);
		}
	});

	it('has a task with three assignees, and one assigned to the seeded employee', () => {
		expect(tasks.some((task) => task.assigneeEmails.length === 3)).toBe(true);
		expect(
			tasks.filter((task) => task.assigneeEmails.includes(emailFor('Eva Employee')))
		).toHaveLength(1);
	});

	it('mixes owners and due dates with nulls, at both levels', () => {
		expect(plan.projects.some((project) => project.ownerEmail === null)).toBe(true);
		expect(plan.projects.some((project) => project.ownerEmail !== null)).toBe(true);
		expect(plan.projects.some((project) => project.dueDate === null)).toBe(true);
		expect(plan.projects.some((project) => project.dueDate !== null)).toBe(true);
		expect(tasks.some((task) => task.dueDate === null)).toBe(true);
		expect(tasks.some((task) => task.dueDate !== null)).toBe(true);
	});

	it('only names people who exist in the inventory plan', () => {
		const emails = new Set(buildPlan(1).people.map((person) => person.email));
		const named = [
			...plan.projects.flatMap((project) => (project.ownerEmail ? [project.ownerEmail] : [])),
			...tasks.flatMap((task) => task.assigneeEmails)
		];

		for (const email of named) expect(emails.has(email)).toBe(true);
	});

	it('includes a task a Spanish stem search can find from its plural', () => {
		expect(tasks.some((task) => /mudanza/i.test(task.title))).toBe(true);
	});
});
