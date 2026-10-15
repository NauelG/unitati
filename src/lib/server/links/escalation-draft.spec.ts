import { describe, expect, it } from 'vitest';
import { TASK_TITLE_MAX } from '../projects';
import { escalationDraft } from './escalation-draft';

describe('escalationDraft', () => {
	it('uses the subject as the title and the description as the description', () => {
		expect(
			escalationDraft({ subject: 'Printer jammed', description: 'It eats every page.' })
		).toEqual({ title: 'Printer jammed', description: 'It eats every page.' });
	});

	it('trims both and turns an empty description into null', () => {
		expect(escalationDraft({ subject: '  Printer jammed \n', description: '  \n' })).toEqual({
			title: 'Printer jammed',
			description: null
		});
	});

	it('keeps a missing description as null', () => {
		expect(
			escalationDraft({ subject: 'Printer jammed', description: null }).description
		).toBeNull();
	});

	it('cuts a long subject to the task-title maximum', () => {
		const { title } = escalationDraft({
			subject: 'x'.repeat(TASK_TITLE_MAX + 50),
			description: null
		});

		expect(title).toHaveLength(TASK_TITLE_MAX);
	});

	it('does not leave trailing whitespace where the cut lands', () => {
		const subject = `${'x'.repeat(TASK_TITLE_MAX - 1)} tail`;

		expect(escalationDraft({ subject, description: null }).title).toBe(
			'x'.repeat(TASK_TITLE_MAX - 1)
		);
	});

	it('never splits a surrogate pair', () => {
		const subject = `${'x'.repeat(TASK_TITLE_MAX - 1)}😀😀`;

		const { title } = escalationDraft({ subject, description: null });

		expect(title).toBe('x'.repeat(TASK_TITLE_MAX - 1));
	});
});
