import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SelectField from './SelectField.svelte';

const OPTIONS = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' }
];

describe('SelectField', () => {
	it('sizes its trigger like a text input, beating the vendored 32px default', () => {
		render(SelectField, { label: 'Cola', options: OPTIONS });

		const classes = screen.getByLabelText('Cola').classList;

		// The vendored trigger sets `data-[size=default]:h-8`; only a rule of the same
		// specificity wins, so the override has to carry the same variant.
		expect(classes).toContain('data-[size=default]:h-[var(--size-control-md)]');
		expect(classes).not.toContain('data-[size=default]:h-8');
	});

	it('uses the input font so iOS does not zoom on focus', () => {
		render(SelectField, { label: 'Cola', options: OPTIONS });

		const classes = screen.getByLabelText('Cola').classList;

		expect(classes).toContain('text-base');
		expect(classes).toContain('md:text-sm');
		expect(classes).not.toContain('text-sm');
	});
});
