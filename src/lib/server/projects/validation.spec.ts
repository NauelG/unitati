import { describe, expect, expectTypeOf, it } from 'vitest';
import {
	createProjectInput,
	createStateInput,
	createTaskInput,
	updateProjectInput,
	updateStateInput,
	updateTaskInput,
	type UpdateStateInput,
	type UpdateTaskInput
} from './validation';

describe('state inputs', () => {
	it('has no group on the update input — a state never changes group', () => {
		// The type and the runtime agree: the compiler rejects the key, and a payload
		// that smuggles it in has it stripped rather than written.
		expectTypeOf<keyof UpdateStateInput>().toEqualTypeOf<'name'>();
		expect(Object.keys(updateStateInput.shape)).toEqual(['name']);
		expect(updateStateInput.parse({ name: 'Revisión', group: 'completed' })).toEqual({
			name: 'Revisión'
		});
	});

	it('takes the group once, at creation, and refuses one that does not exist', () => {
		expect(createStateInput.parse({ name: 'Bloqueada', group: 'started' }).group).toBe('started');
		expect(() => createStateInput.parse({ name: 'Bloqueada', group: 'done' })).toThrow();
	});

	it('trims the name and refuses a blank one', () => {
		expect(updateStateInput.parse({ name: '  Revisión ' }).name).toBe('Revisión');
		expect(() => updateStateInput.parse({ name: '   ' })).toThrow();
	});
});

describe('task inputs', () => {
	it('cannot move a task: no project, state or position on the update', () => {
		expectTypeOf<keyof UpdateTaskInput>().toEqualTypeOf<
			'title' | 'description' | 'dueDate' | 'taskTag'
		>();
		expect(Object.keys(updateTaskInput.shape).sort()).toEqual(
			['description', 'dueDate', 'taskTag', 'title'].sort()
		);
		expect(
			updateTaskInput.parse({ title: 'x', projectId: 'p', stateId: 's', position: 1 })
		).toEqual({ title: 'x' });
	});

	it('leaves an absent field absent on update, so it is not written', () => {
		const parsed = updateTaskInput.parse({ title: 'Solo el título' });

		expect('description' in parsed && parsed.description !== undefined).toBe(false);
		expect(parsed.dueDate).toBeUndefined();
	});

	it('turns an empty description into none, and null clears a due date', () => {
		expect(updateTaskInput.parse({ description: '  ' }).description).toBeNull();
		expect(updateTaskInput.parse({ dueDate: null }).dueDate).toBeNull();
		expect(createTaskInput.parse({ title: 'x' }).description).toBeNull();
	});

	it('refuses a due date that is not a calendar date', () => {
		expect(() => updateTaskInput.parse({ dueDate: '1 Dec' })).toThrow();
		expect(() => updateTaskInput.parse({ dueDate: '2026-02-30' })).toThrow();
	});
});

describe('tags', () => {
	it('refuses `new` as a project or task tag, whatever its case', () => {
		expect(() => createProjectInput.parse({ name: 'x', projectTag: 'new' })).toThrow();
		expect(() => updateProjectInput.parse({ projectTag: 'New' })).toThrow();
		expect(() => createTaskInput.parse({ title: 'x', taskTag: 'NEW' })).toThrow();
		expect(() => updateTaskInput.parse({ taskTag: 'new' })).toThrow();
	});

	it('accepts any other tag, trimmed', () => {
		expect(updateProjectInput.parse({ projectTag: ' PRJ-0042 ' }).projectTag).toBe('PRJ-0042');
	});
});
