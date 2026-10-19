import { describe, expect, it } from 'vitest';
import type { LocationEntry } from '../directory';
import { planLocation, withPlanned } from './locations';

function entry(id: string, path: string, code: string | null = null): LocationEntry {
	const names = path.split(' › ');
	return {
		id,
		name: names[names.length - 1],
		parentId: null,
		path,
		depth: names.length - 1,
		code,
		address: null,
		notes: null,
		latitude: null,
		longitude: null
	};
}

const catalogue = [
	entry('bcn', 'Barcelona office', 'BCN'),
	entry('bcn1', 'Barcelona office › Floor 1', 'BCN-1'),
	entry('gro', 'Girona office', 'GRO'),
	entry('gro1', 'Girona office › Floor 1', 'GRO-1'),
	entry('wh', 'Warehouse', 'WH')
];

const matchId = (value: string) => {
	const resolution = planLocation(value, catalogue);
	return resolution.kind === 'match' ? resolution.location.id : resolution.kind;
};

describe('planLocation', () => {
	it('matches a code, case-blind', () => {
		expect(matchId('gro')).toBe('gro');
		expect(matchId('BCN-1')).toBe('bcn1');
	});

	it('matches a full path written with › or /', () => {
		expect(matchId('Barcelona office › Floor 1')).toBe('bcn1');
		expect(matchId('barcelona OFFICE/floor 1')).toBe('bcn1');
	});

	it('matches a single name carried by exactly one location', () => {
		expect(matchId('Warehouse')).toBe('wh');
		expect(matchId('almacén')).toBe('create');
	});

	it('refuses a single name carried by several locations', () => {
		expect(matchId('Floor 1')).toBe('ambiguous');
	});

	it('creates a root for an unknown single name', () => {
		expect(planLocation('Nueva sede', catalogue)).toEqual({
			kind: 'create',
			parent: null,
			names: ['Nueva sede']
		});
	});

	it('creates the missing tail under the deepest existing ancestor', () => {
		const resolution = planLocation('Barcelona office › Floor 1 › Room 3 › Desk 2', catalogue);
		expect(resolution).toMatchObject({ kind: 'create', names: ['Room 3', 'Desk 2'] });
		expect(resolution.kind === 'create' && resolution.parent?.id).toBe('bcn1');
	});

	it('creates a whole new chain from a root', () => {
		expect(planLocation('Nueva sede › Planta 2', catalogue)).toMatchObject({
			kind: 'create',
			parent: null,
			names: ['Nueva sede', 'Planta 2']
		});
	});

	it('treats a blank value as none', () => {
		expect(planLocation('  ', catalogue)).toEqual({ kind: 'none' });
	});

	it('finds a path created by an earlier row instead of creating it twice', () => {
		const working = [...catalogue];
		const first = planLocation('Nueva sede › Planta 2', working);
		if (first.kind !== 'create') throw new Error('expected create');
		withPlanned(working, first);
		expect(planLocation('Nueva sede › Planta 2', working).kind).toBe('match');
		expect(planLocation('Nueva sede › Planta 3', working)).toMatchObject({
			kind: 'create',
			names: ['Planta 3']
		});
	});
});
