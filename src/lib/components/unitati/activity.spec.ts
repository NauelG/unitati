import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '#lib/server/activity/index.js';
import { activitySentence } from './activity';

const PERSON = '3f1e0c9a-0000-4000-8000-000000000001';
const LOCATION = '3f1e0c9a-0000-4000-8000-000000000002';

describe('activitySentence', () => {
	it('names the person a custody assignment went to', () => {
		const entry: ActivityEntry = {
			verb: 'custody.assigned',
			payload: { toPersonId: PERSON, toPersonName: 'Ada Lovelace' }
		};

		expect(activitySentence(entry)).toContain('Ada Lovelace');
	});

	it('reads the snapshot, not a live lookup — that is what survives a rename', () => {
		const entry: ActivityEntry = {
			verb: 'custody.returned',
			payload: { fromPersonId: PERSON, fromPersonName: 'Ada Byron' }
		};

		expect(activitySentence(entry)).toContain('Ada Byron');
	});

	it('names both states through their labels, not their keys', () => {
		const entry: ActivityEntry = {
			verb: 'state.changed',
			payload: { from: 'in_stock', to: 'in_use' }
		};
		const sentence = activitySentence(entry);

		expect(sentence).toContain('En stock');
		expect(sentence).toContain('En uso');
		expect(sentence).not.toContain('in_stock');
	});

	it('says "sin ubicación" rather than nothing when a location end is null', () => {
		const entry: ActivityEntry = {
			verb: 'location.changed',
			payload: {
				fromLocationId: null,
				fromLocationName: null,
				toLocationId: LOCATION,
				toLocationName: 'Planta 2'
			}
		};
		const sentence = activitySentence(entry);

		expect(sentence).toContain('sin ubicación');
		expect(sentence).toContain('Planta 2');
	});

	it('renders a sentence for every verb, with no empty result', () => {
		const entries: ActivityEntry[] = [
			{ verb: 'asset.created', payload: { assetTag: 'AST-0001', name: 'MacBook Pro' } },
			{ verb: 'custody.assigned', payload: { toPersonId: PERSON, toPersonName: 'Ada' } },
			{ verb: 'custody.returned', payload: { fromPersonId: PERSON, fromPersonName: 'Ada' } },
			{ verb: 'state.changed', payload: { from: 'in_use', to: 'in_repair' } },
			{
				verb: 'location.changed',
				payload: {
					fromLocationId: LOCATION,
					fromLocationName: 'Planta 1',
					toLocationId: null,
					toLocationName: null
				}
			},
			{ verb: 'note.added', payload: { text: 'Cambiada la batería.' } },
			{
				verb: 'link.asset.added',
				payload: { assetId: PERSON, assetTag: 'AST-0142', assetName: 'MacBook Pro' }
			},
			{
				verb: 'link.asset.removed',
				payload: { assetId: PERSON, assetTag: 'AST-0142', assetName: 'MacBook Pro' }
			},
			{ verb: 'project.created', payload: { projectTag: 'PRJ-0001', name: 'Migración' } },
			{ verb: 'project.archived', payload: {} },
			{ verb: 'project.unarchived', payload: {} },
			{
				verb: 'project.owner.changed',
				payload: {
					fromPersonId: null,
					fromPersonName: null,
					toPersonId: PERSON,
					toPersonName: 'Ada'
				}
			},
			{ verb: 'project.due.changed', payload: { from: null, to: '2026-12-01' } },
			{ verb: 'task.created', payload: { taskTag: 'TSK-0001', title: 'Mudanza' } },
			{
				verb: 'task.state.changed',
				payload: {
					fromStateId: PERSON,
					fromStateName: 'Origen',
					toStateId: LOCATION,
					toStateName: 'Destino'
				}
			},
			{ verb: 'task.assigned', payload: { toPersonId: PERSON, toPersonName: 'Ada' } },
			{ verb: 'task.unassigned', payload: { fromPersonId: PERSON, fromPersonName: 'Ada' } },
			{ verb: 'task.due.changed', payload: { from: '2026-12-01', to: null } }
		];

		for (const entry of entries) {
			expect(activitySentence(entry).trim()).not.toBe('');
		}
	});

	it('does not leak the note body into the sentence', () => {
		const entry: ActivityEntry = {
			verb: 'note.added',
			payload: { text: 'Contraseña del BIOS: hunter2' }
		};

		// The body is rendered as the note itself, below the sentence. Inlining it
		// here would put it into every timeline summary and every notification.
		expect(activitySentence(entry)).not.toContain('hunter2');
	});
});

describe('activitySentence for projects', () => {
	it('reads the state names recorded at the move, whatever the catalogue says today', () => {
		const sentence = activitySentence({
			verb: 'task.state.changed',
			payload: {
				fromStateId: PERSON,
				fromStateName: 'Antes',
				toStateId: LOCATION,
				toStateName: 'Después'
			}
		});

		expect(sentence).toContain('Antes');
		expect(sentence).toContain('Después');
	});

	it('says there was nobody rather than printing null when an owner end is empty', () => {
		const sentence = activitySentence({
			verb: 'project.owner.changed',
			payload: { fromPersonId: null, fromPersonName: null, toPersonId: PERSON, toPersonName: 'Ada' }
		});

		expect(sentence).toContain('nadie');
		expect(sentence).not.toContain('null');
	});
});

describe('activitySentence for tickets', () => {
	it('names the queue ends from the snapshot', () => {
		const entry: ActivityEntry = {
			verb: 'ticket.queue.changed',
			payload: {
				fromQueueId: PERSON,
				fromQueueName: 'Hardware',
				toQueueId: LOCATION,
				toQueueName: 'Redes'
			}
		};
		const sentence = activitySentence(entry);

		expect(sentence).toContain('Hardware');
		expect(sentence).toContain('Redes');
	});

	it('says "Normal" in a priority change even though it renders no badge', () => {
		const entry: ActivityEntry = {
			verb: 'ticket.priority.changed',
			payload: { from: 'normal', to: 'urgent' }
		};

		expect(activitySentence(entry)).toContain('Normal');
	});

	it('names the status ends through their labels', () => {
		const entry: ActivityEntry = {
			verb: 'ticket.status.changed',
			payload: { from: 'new', to: 'in_progress' }
		};
		const sentence = activitySentence(entry);

		expect(sentence).toContain('Nuevo');
		expect(sentence).toContain('En curso');
	});
});

describe('activitySentence for linked assets', () => {
	const payload = { assetId: PERSON, assetTag: 'AST-0142', assetName: 'MacBook Pro' };

	// The thread draws the asset itself, as a `RecordRef`, right after the
	// sentence. Naming it here as well would print the tag twice on one line.
	it('says what happened and leaves the asset to the reference beside it', () => {
		const added = activitySentence({ verb: 'link.asset.added', payload });
		const removed = activitySentence({ verb: 'link.asset.removed', payload });

		expect({ added, removed }).toEqual({
			added: 'Vinculó el activo',
			removed: 'Desvinculó el activo'
		});
	});
});
