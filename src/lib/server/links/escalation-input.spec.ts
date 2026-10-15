import { describe, expect, it } from 'vitest';
import { invalidField, parseEscalation } from './escalation-input';

const id = '0d8f7a52-6c1e-4d6b-9a55-7b1d6d3f2a10';

describe('parseEscalation', () => {
	it('reads each of the four targets', () => {
		expect(
			parseEscalation({ kind: 'new_task', projectId: id, title: 'T', description: ' ' })
		).toEqual({
			ok: true,
			target: { kind: 'new_task', projectId: id, title: 'T', description: null }
		});
		expect(parseEscalation({ kind: 'existing_task', taskId: id }).ok).toBe(true);
		expect(parseEscalation({ kind: 'existing_project', projectId: id }).ok).toBe(true);
		expect(parseEscalation({ kind: 'new_project', name: 'N' })).toEqual({
			ok: true,
			target: { kind: 'new_project', name: 'N', ownerPersonId: null }
		});
	});

	it('blames the field that is missing or malformed', () => {
		expect(parseEscalation({ kind: 'new_task', title: 'T' })).toEqual({
			ok: false,
			field: 'projectId'
		});
		expect(parseEscalation({ kind: 'new_task', projectId: id, title: '  ' })).toEqual({
			ok: false,
			field: 'title'
		});
		expect(parseEscalation({ kind: 'existing_task', taskId: 'x' })).toEqual({
			ok: false,
			field: 'taskId'
		});
		expect(parseEscalation({ kind: 'new_project', name: '' })).toEqual({
			ok: false,
			field: 'name'
		});
		expect(parseEscalation({ kind: 'new_project', name: 'N', ownerPersonId: 'x' })).toEqual({
			ok: false,
			field: 'ownerPersonId'
		});
		expect(parseEscalation({ kind: 'nope' })).toEqual({ ok: false, field: 'kind' });
	});

	it('maps a domain invalid_input to the free-text field of the kind', () => {
		expect(invalidField('new_task')).toBe('title');
		expect(invalidField('new_project')).toBe('name');
		expect(invalidField('existing_task')).toBeNull();
	});
});
