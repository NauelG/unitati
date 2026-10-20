import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '#lib/server/activity/index.js';
import { activitySentence, projectChangedParts } from './activity';

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
			{ verb: 'project.attachment.added', payload: { filename: 'plan.pdf' } },
			{ verb: 'project.attachment.removed', payload: { filename: 'plan.pdf' } },
			{ verb: 'task.attachment.added', payload: { filename: 'plan.pdf' } },
			{ verb: 'task.attachment.removed', payload: { filename: 'plan.pdf' } },
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
			{ verb: 'task.due.changed', payload: { from: '2026-12-01', to: null } },
			{ verb: 'task.project.changed', payload: PROJECT_CHANGED }
		];

		for (const entry of entries) {
			expect(activitySentence(entry).trim()).not.toBe('');
		}
	});

	it('names the file in an attachment entry', () => {
		expect(
			activitySentence({ verb: 'task.attachment.added', payload: { filename: 'plan.pdf' } })
		).toContain('plan.pdf');
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

const PROJECT_CHANGED = {
	fromProjectId: PERSON,
	fromProjectTag: 'PRJ-0001',
	fromProjectName: 'Oficina',
	toProjectId: LOCATION,
	toProjectTag: 'PRJ-0002',
	toProjectName: 'Almacén'
};

describe('task.project.changed', () => {
	it('reads the codes and names recorded at the move', () => {
		expect(activitySentence({ verb: 'task.project.changed', payload: PROJECT_CHANGED })).toBe(
			'Movida de PRJ-0001 Oficina a PRJ-0002 Almacén'
		);
	});

	it('splits into text and the two project references, in reading order', () => {
		expect(projectChangedParts(PROJECT_CHANGED)).toEqual([
			{ text: 'Movida de ' },
			{ project: { tag: 'PRJ-0001', name: 'Oficina' } },
			{ text: ' a ' },
			{ project: { tag: 'PRJ-0002', name: 'Almacén' } }
		]);
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

	it('quotes both ends of a subject change', () => {
		const entry: ActivityEntry = {
			verb: 'ticket.subject.changed',
			payload: { from: 'Impresora rota', to: 'Impresora de planta 2 rota' }
		};

		expect(activitySentence(entry)).toBe(
			'Cambió el asunto de «Impresora rota» a «Impresora de planta 2 rota»'
		);
	});

	it('says a comment was edited without saying what changed', () => {
		const entry: ActivityEntry = {
			verb: 'comment.edited',
			payload: { commentId: PERSON, visibility: 'public' }
		};

		expect(activitySentence(entry)).toBe('Editó un comentario');
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

describe('activitySentence for imported assets', () => {
	it('says an asset was registered by an import', () => {
		expect(
			activitySentence({
				verb: 'asset.created',
				payload: { assetTag: 'AST-0001', name: 'MacBook Pro', via: 'import' }
			})
		).toBe('Registró el activo mediante una importación');
	});
});

describe('activitySentence for directory events', () => {
	const DEPARTMENT = '3f1e0c9a-0000-4000-8000-000000000003';

	it('says a person was added to the directory', () => {
		const sentence = activitySentence({
			verb: 'person.created',
			payload: { fullName: 'Ada Lovelace', email: 'ada@example.com' }
		});

		expect(sentence).toBe('Añadió a la persona al directorio');
	});

	it('says a person was added by an import, and where the import placed them', () => {
		expect(
			activitySentence({
				verb: 'person.created',
				payload: { fullName: 'Ada Lovelace', email: 'ada@example.com', via: 'import' }
			})
		).toBe('Añadió a la persona al directorio mediante una importación');
		expect(
			activitySentence({
				verb: 'person.location.changed',
				payload: {
					from: null,
					to: { id: '3f1e0c9a-0000-4000-8000-000000000003', path: 'Barcelona office › Floor 1' },
					reason: 'imported'
				}
			})
		).toBe('Se le asignó la ubicación Barcelona office › Floor 1 al importarla');
	});

	it('says a person was deactivated', () => {
		expect(activitySentence({ verb: 'person.deactivated', payload: {} })).toBe(
			'Desactivó a la persona'
		);
	});

	it('says a person was reactivated', () => {
		expect(activitySentence({ verb: 'person.reactivated', payload: {} })).toBe(
			'Reactivó a la persona'
		);
	});

	it('names both departments from the snapshot, with a word for none', () => {
		const sentence = activitySentence({
			verb: 'person.department.changed',
			payload: {
				fromDepartmentId: null,
				fromDepartmentName: null,
				toDepartmentId: DEPARTMENT,
				toDepartmentName: 'Soporte'
			}
		});

		expect(sentence).toBe('Cambió el departamento de sin departamento a Soporte');
	});
});

describe('activitySentence for locations', () => {
	const PARENT = (path: string) => ({ id: PERSON, path });

	it('renders created and deleted with the recorded path', () => {
		expect(
			activitySentence({
				verb: 'catalogue.location.created',
				payload: {
					name: 'Floor 3',
					path: 'Barcelona office › Floor 3',
					parentId: PERSON,
					code: null,
					address: null,
					notes: null,
					latitude: null,
					longitude: null
				}
			})
		).toBe('Creó la ubicación Barcelona office › Floor 3');
		expect(
			activitySentence({
				verb: 'catalogue.location.deleted',
				payload: { name: 'Floor 3', path: 'Barcelona office › Floor 3', code: null }
			})
		).toBe('Eliminó la ubicación Barcelona office › Floor 3');
	});

	it('renders a rename, a move and a multi-field edit', () => {
		expect(
			activitySentence({
				verb: 'catalogue.location.updated',
				payload: { path: 'Floor 4', changes: { name: { from: 'Floor 3', to: 'Floor 4' } } }
			})
		).toBe('Renombró la ubicación Floor 3 como Floor 4');
		expect(
			activitySentence({
				verb: 'catalogue.location.updated',
				payload: {
					path: 'Girona office › Floor 3',
					changes: {
						parent: { from: PARENT('Barcelona office'), to: PARENT('Girona office') }
					}
				}
			})
		).toBe('Movió la ubicación Floor 3 de Barcelona office a Girona office');
		expect(
			activitySentence({
				verb: 'catalogue.location.updated',
				payload: {
					path: 'Floor 3',
					changes: {
						code: { from: null, to: 'F3' },
						latitude: { from: null, to: 1 },
						longitude: { from: null, to: 2 }
					}
				}
			})
		).toBe('Editó la ubicación Floor 3: código, coordenadas');
	});

	it('renders a person location change with a word for the missing end', () => {
		const ref = { id: LOCATION, path: 'Barcelona office › Floor 1' };
		expect(
			activitySentence({
				verb: 'person.location.changed',
				payload: { from: null, to: ref, reason: 'edited' }
			})
		).toBe('Cambió la ubicación de Sin ubicación a Barcelona office › Floor 1');
		expect(
			activitySentence({
				verb: 'person.location.changed',
				payload: { from: ref, to: null, reason: 'location_deleted' }
			})
		).toBe('Perdió la ubicación Barcelona office › Floor 1 al eliminarse');
	});
});
