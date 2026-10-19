import { describe, expect, it } from 'vitest';
import { ACTIVITY_VERBS } from './verbs';
import { PAYLOAD_SCHEMAS, parsePayload } from './payload';

const PERSON = '3f1e0c9a-0000-4000-8000-000000000001';
const LOCATION = '3f1e0c9a-0000-4000-8000-000000000002';

describe('the payload contract', () => {
	it('declares a schema for every verb', () => {
		expect(Object.keys(PAYLOAD_SCHEMAS).sort()).toEqual([...ACTIVITY_VERBS].sort());
	});

	it('declares no schema for a verb that does not exist', () => {
		expect(ACTIVITY_VERBS).toHaveLength(Object.keys(PAYLOAD_SCHEMAS).length);
	});
});

describe('parsePayload', () => {
	it('accepts a person location change and refuses one without a reason', () => {
		const ref = { id: LOCATION, path: 'Barcelona office › Floor 1' };
		expect(
			parsePayload('person.location.changed', { from: null, to: ref, reason: 'edited' })
		).toEqual({ from: null, to: ref, reason: 'edited' });
		expect(() => parsePayload('person.location.changed', { from: null, to: ref })).toThrow();
		expect(
			parsePayload('person.location.changed', { from: null, to: ref, reason: 'imported' }).reason
		).toBe('imported');
	});

	it('parses person.created with or without via, and refuses another via', () => {
		const base = { fullName: 'Ada', email: 'ada@example.com' };
		expect(parsePayload('person.created', base)).toEqual(base);
		expect(parsePayload('person.created', { ...base, via: 'import' })).toEqual({
			...base,
			via: 'import'
		});
		expect(() => parsePayload('person.created', { ...base, via: 'api' })).toThrow();
	});

	it('accepts a well-formed custody assignment', () => {
		expect(
			parsePayload('custody.assigned', { toPersonId: PERSON, toPersonName: 'Ada Lovelace' })
		).toEqual({ toPersonId: PERSON, toPersonName: 'Ada Lovelace' });
	});

	it('refuses a custody entry with no snapshot, which is the whole point of one', () => {
		expect(() => parsePayload('custody.assigned', { toPersonId: PERSON })).toThrow();
	});

	it('refuses an empty snapshot name', () => {
		expect(() =>
			parsePayload('custody.assigned', { toPersonId: PERSON, toPersonName: '' })
		).toThrow();
	});

	it('refuses an identifier that is not a uuid', () => {
		expect(() =>
			parsePayload('custody.assigned', { toPersonId: 'ada', toPersonName: 'Ada' })
		).toThrow();
	});

	it('refuses a state outside the four', () => {
		expect(() => parsePayload('state.changed', { from: 'in_stock', to: 'lost' })).toThrow();
	});

	it('accepts a state change between two real states', () => {
		expect(parsePayload('state.changed', { from: 'in_stock', to: 'in_use' })).toEqual({
			from: 'in_stock',
			to: 'in_use'
		});
	});

	it('accepts a location change with either end missing', () => {
		expect(
			parsePayload('location.changed', {
				fromLocationId: null,
				fromLocationName: null,
				toLocationId: LOCATION,
				toLocationName: 'Planta 2'
			})
		).toMatchObject({ fromLocationId: null, toLocationName: 'Planta 2' });
	});

	it('refuses a location change that omits an end entirely', () => {
		expect(() =>
			parsePayload('location.changed', { toLocationId: LOCATION, toLocationName: 'Planta 2' })
		).toThrow();
	});

	it('refuses a note with no text', () => {
		expect(() => parsePayload('note.added', { text: '' })).toThrow();
	});

	it('keeps the tag and name of a linked asset, so the entry survives a rename', () => {
		expect(
			parsePayload('link.asset.added', {
				assetId: PERSON,
				assetTag: 'AST-0142',
				assetName: 'MacBook Pro'
			})
		).toEqual({ assetId: PERSON, assetTag: 'AST-0142', assetName: 'MacBook Pro' });
	});

	it('refuses a linked-asset entry with no snapshot', () => {
		expect(() => parsePayload('link.asset.removed', { assetId: PERSON })).toThrow();
	});

	it('refuses a payload belonging to a different verb', () => {
		expect(() => parsePayload('note.added', { assetTag: 'AST-0001', name: 'MacBook' })).toThrow();
	});

	it('keeps the state names of a task move next to their ids', () => {
		expect(
			parsePayload('task.state.changed', {
				fromStateId: PERSON,
				fromStateName: 'Origen',
				toStateId: LOCATION,
				toStateName: 'Destino'
			})
		).toMatchObject({ fromStateName: 'Origen', toStateName: 'Destino' });
		expect(() =>
			parsePayload('task.state.changed', { fromStateId: PERSON, toStateId: LOCATION })
		).toThrow();
	});

	it('accepts a project owner arriving from nobody, and refuses a name without its id', () => {
		expect(
			parsePayload('project.owner.changed', {
				fromPersonId: null,
				fromPersonName: null,
				toPersonId: PERSON,
				toPersonName: 'Ada'
			})
		).toMatchObject({ fromPersonId: null, toPersonId: PERSON });
		expect(() =>
			parsePayload('project.owner.changed', { toPersonId: PERSON, toPersonName: 'Ada' })
		).toThrow();
	});

	it('takes calendar dates for a due change, nullable at both ends', () => {
		expect(parsePayload('task.due.changed', { from: null, to: '2026-12-01' })).toEqual({
			from: null,
			to: '2026-12-01'
		});
		expect(() => parsePayload('task.due.changed', { from: null, to: '1 Dec' })).toThrow();
	});
});
