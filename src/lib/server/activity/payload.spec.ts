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

	it('parses the knowledge-base verbs and refuses what is malformed', () => {
		expect(parsePayload('space.created', { name: 'Ayuda', audience: 'portal' })).toEqual({
			name: 'Ayuda',
			audience: 'portal'
		});
		expect(() => parsePayload('space.created', { name: 'Ayuda', audience: 'everyone' })).toThrow();
		expect(
			parsePayload('space.audience.changed', { from: 'staff', to: 'portal', pageCount: 0 })
				.pageCount
		).toBe(0);
		expect(() => parsePayload('space.archived', { pageCount: -1 })).toThrow();
		expect(parsePayload('page.published', {})).toEqual({});
		expect(
			parsePayload('page.moved', {
				fromSpace: 'A',
				toSpace: 'B',
				fromParentTag: null,
				toParentTag: 'DOC-0001'
			}).toParentTag
		).toBe('DOC-0001');
		expect(() => parsePayload('page.revision.restored', { from: 0, to: 2 })).toThrow();
		expect(() => parsePayload('page.attachment.added', { filename: '' })).toThrow();
	});
});

describe('ticket.labels.changed', () => {
	const vpn = { id: PERSON, name: 'VPN' };

	it('accepts added and removed labels with their names', () => {
		expect(parsePayload('ticket.labels.changed', { added: [vpn], removed: [] })).toEqual({
			added: [vpn],
			removed: []
		});
	});

	it('refuses a label with no name snapshot or a side that is missing', () => {
		expect(() =>
			parsePayload('ticket.labels.changed', { added: [{ id: PERSON }], removed: [] })
		).toThrow();
		expect(() => parsePayload('ticket.labels.changed', { added: [vpn] })).toThrow();

describe('the milestone payloads', () => {
	const MILESTONE = '3f1e0c9a-0000-4000-8000-0000000000a1';
	const dates = { startDate: '2026-11-01', targetDate: '2026-11-30' };

	it('project.milestone.created accepts a snapshot and refuses a non-ISO date', () => {
		const payload = { milestoneId: MILESTONE, name: 'Piloto', ...dates };
		expect(parsePayload('project.milestone.created', payload)).toEqual(payload);
		expect(() =>
			parsePayload('project.milestone.created', { ...payload, startDate: '01/11/2026' })
		).toThrow();
		expect(() => parsePayload('project.milestone.created', { ...payload, name: '' })).toThrow();
	});

	it('project.milestone.changed holds only changed fields and refuses unknown keys', () => {
		const payload = {
			milestoneId: MILESTONE,
			name: 'Piloto',
			from: { targetDate: '2026-11-30' },
			to: { targetDate: '2026-12-15' }
		};
		expect(parsePayload('project.milestone.changed', payload)).toEqual(payload);
		expect(() =>
			parsePayload('project.milestone.changed', { ...payload, to: { colour: 'red' } })
		).toThrow();
		expect(() =>
			parsePayload('project.milestone.changed', { ...payload, from: { targetDate: 'soon' } })
		).toThrow();
	});

	it('project.milestone.deleted carries the name only', () => {
		expect(parsePayload('project.milestone.deleted', { name: 'Piloto' })).toEqual({
			name: 'Piloto'
		});
		expect(() => parsePayload('project.milestone.deleted', { name: '' })).toThrow();
	});

	it('task.milestone.changed accepts a milestone or null at each end', () => {
		const ref = { id: MILESTONE, name: 'Piloto' };
		expect(parsePayload('task.milestone.changed', { from: null, to: ref }).to).toEqual(ref);
		expect(parsePayload('task.milestone.changed', { from: ref, to: null }).from).toEqual(ref);
		expect(() =>
			parsePayload('task.milestone.changed', { from: { id: 'x', name: 'Piloto' }, to: null })
		).toThrow();
		expect(() => parsePayload('task.milestone.changed', { from: null })).toThrow();
	});
});
