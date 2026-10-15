import { describe, expect, it } from 'vitest';
import {
	consequence,
	escalationKind,
	initialTarget,
	isReady,
	pickedFrom,
	projectModesFor,
	submitLabel,
	targetsFor,
	type Draft
} from './escalation-form.js';

const blank: Draft = {
	projectId: null,
	title: '',
	description: '',
	taskId: null,
	existingProjectId: null,
	name: ''
};

describe('what the Sheet offers', () => {
	it('puts a new task first and offers every target to someone who can create', () => {
		expect(targetsFor(true)).toEqual(['new_task', 'existing_task', 'project']);
		expect(projectModesFor(true)).toEqual(['new', 'existing']);
		expect(initialTarget(true)).toBe('new_task');
	});

	it('offers nothing new, and opens on an existing task, without projects.manage', () => {
		expect(targetsFor(false)).toEqual(['existing_task', 'project']);
		expect(projectModesFor(false)).toEqual(['existing']);
		expect(initialTarget(false)).toBe('existing_task');
	});

	it('joins the three targets and the project mode into the domain kinds', () => {
		expect(escalationKind('new_task', 'existing')).toBe('new_task');
		expect(escalationKind('project', 'new')).toBe('new_project');
		expect(escalationKind('project', 'existing')).toBe('existing_project');
	});
});

describe('the primary button', () => {
	it('names the act for each target', () => {
		expect(submitLabel('new_task', null)).toBe('Crear tarea y vincular');
		expect(submitLabel('new_project', null)).toBe('Crear proyecto y vincular');
		expect(submitLabel('existing_task', { tag: 'TSK-0042', label: 'x' })).toBe(
			'Vincular a TSK-0042'
		);
		expect(submitLabel('existing_project', { tag: 'PRJ-007', label: 'x' })).toBe(
			'Vincular a PRJ-007'
		);
	});

	it('names a picked option by its tag and title, not by parsing its label', () => {
		expect(
			pickedFrom({ label: 'TSK-0042 · A · B · PRJ-007', tag: 'TSK-0042', title: 'A · B' })
		).toEqual({ tag: 'TSK-0042', label: 'TSK-0042 · A · B' });
	});
});

describe('when it can be submitted', () => {
	it('needs a project and a title for a new task', () => {
		expect(isReady('new_task', blank)).toBe(false);
		expect(isReady('new_task', { ...blank, projectId: 'p', title: '  ' })).toBe(false);
		expect(isReady('new_task', { ...blank, projectId: 'p', title: 'Do it' })).toBe(true);
	});

	it('needs a pick for an existing record and a name for a new project', () => {
		expect(isReady('existing_task', { ...blank, taskId: 't' })).toBe(true);
		expect(isReady('existing_project', blank)).toBe(false);
		expect(isReady('new_project', { ...blank, name: 'Obra' })).toBe(true);
	});
});

describe('the consequence text', () => {
	const base = { picked: null, statusLabel: 'En curso', assigneeName: 'Marta Puig' };

	it('always says the ticket keeps its status', () => {
		for (const kind of ['new_task', 'existing_task', 'existing_project', 'new_project'] as const) {
			expect(consequence({ ...base, kind })).toContain(
				'El ticket sigue en En curso; su prioridad, cola y asignado no cambian.'
			);
		}
	});

	it('names who is mailed when a task completes', () => {
		expect(consequence({ ...base, kind: 'new_task' }).at(-1)).toBe(
			'Cuando la tarea pase a un estado completado, se avisará por correo a Marta Puig.'
		);
	});

	it('says nobody is told when the ticket has no assignee', () => {
		expect(consequence({ ...base, kind: 'existing_task', assigneeName: null }).at(-1)).toContain(
			'el ticket no tiene asignado'
		);
	});

	it('has no mail sentence for a project', () => {
		for (const kind of ['existing_project', 'new_project'] as const) {
			expect(consequence({ ...base, kind }).join(' ')).not.toContain('correo');
		}
	});

	it('follows the chosen record', () => {
		const lines = consequence({
			...base,
			kind: 'existing_task',
			picked: { tag: 'TSK-0042', label: 'TSK-0042 · Cambiar tóner' }
		});
		expect(lines[0]).toBe('Se vinculará este ticket a TSK-0042 · Cambiar tóner.');
	});
});
