import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '#lib/server/activity/payload.js';
import { activityActor, activitySentence } from './activity';

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
			{ verb: 'note.added', payload: { text: 'Cambiada la batería.' } }
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

describe('activityActor', () => {
	it('uses the actor name when there is one', () => {
		expect(activityActor('Ada Lovelace')).toBe('Ada Lovelace');
	});

	it('names the system when there is none', () => {
		expect(activityActor(null)).toBe('El sistema');
	});
});
