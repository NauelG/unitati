import { describe, expect, expectTypeOf, it } from 'vitest';
import {
	createProjectInput,
	createStateInput,
	createTaskInput,
	MILESTONE_NAME_MAX,
	parseMilestoneInput,
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

describe('milestone input', () => {
	const valid = { name: 'Piloto', startDate: '2026-11-01', targetDate: '2026-11-30' };
	const failure = (input: object, partial = false) => {
		const outcome = parseMilestoneInput(input, partial);
		return outcome.ok ? null : outcome.error;
	};

	it('trims the name and accepts 1 to 200 characters', () => {
		expect(MILESTONE_NAME_MAX).toBe(200);
		expect(parseMilestoneInput({ ...valid, name: '  Piloto ' }, false)).toMatchObject({
			ok: true,
			value: { name: 'Piloto' }
		});
		expect(failure({ ...valid, name: 'a'.repeat(200) })).toBeNull();
	});

	it('refuses an empty, blank or 201-character name', () => {
		expect(failure({ ...valid, name: '' })).toBe('invalid_name');
		expect(failure({ ...valid, name: '   ' })).toBe('invalid_name');
		expect(failure({ ...valid, name: 'a'.repeat(201) })).toBe('invalid_name');
	});

	it('turns an empty description into none and refuses one over the rich-text max', () => {
		expect(parseMilestoneInput({ ...valid, description: '  ' }, false)).toMatchObject({
			ok: true,
			value: { description: null }
		});
		expect(failure({ ...valid, description: 'x'.repeat(20_001) })).toBe('invalid_description');
		expect(failure({ description: 'x'.repeat(20_001) }, true)).toBe('invalid_description');
	});

	it('refuses dates that are not ISO calendar days', () => {
		expect(failure({ ...valid, startDate: '01/11/2026' })).toBe('invalid_dates');
		expect(failure({ ...valid, targetDate: '2026-02-30' })).toBe('invalid_dates');
		expect(failure({ ...valid, targetDate: undefined })).toBe('invalid_dates');
	});

	it('refuses a start after the target, and allows a one-day milestone', () => {
		expect(failure({ ...valid, startDate: '2026-12-01' })).toBe('invalid_dates');
		expect(failure({ ...valid, startDate: '2026-11-30' })).toBeNull();
	});

	it('leaves absent fields absent on a partial update', () => {
		const outcome = parseMilestoneInput({ name: 'Nuevo' }, true);
		expect(outcome).toEqual({ ok: true, value: { name: 'Nuevo' } });
	});
});

describe('task input: milestone', () => {
	it('accepts an optional milestone id on creation and refuses a non-uuid', () => {
		const id = '3f1e0c9a-0000-4000-8000-0000000000a1';
		expect(createTaskInput.parse({ title: 'x', milestoneId: id }).milestoneId).toBe(id);
		expect(createTaskInput.parse({ title: 'x' }).milestoneId).toBeUndefined();
		expect(() => createTaskInput.parse({ title: 'x', milestoneId: 'nope' })).toThrow();
	});
});
