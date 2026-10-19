import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EnvironmentBadge from './EnvironmentBadge.svelte';

describe('EnvironmentBadge', () => {
	it('renders nothing in production', () => {
		const { container } = render(EnvironmentBadge, { environment: 'production' });
		expect(container.querySelector('[data-environment]')).toBeNull();
	});

	it.each(['development', 'staging'] as const)('floats fixed and click-through in %s', (env) => {
		const { container } = render(EnvironmentBadge, { environment: env });
		const badge = container.querySelector('[data-environment]');
		expect(badge).not.toBeNull();
		expect(badge?.getAttribute('role')).toBe('status');
		expect(badge?.className).toContain('fixed');
		expect(badge?.className).toContain('pointer-events-none');
		expect(badge?.className).toContain('--z-env-badge');
	});

	it('renders inline when floating is off', () => {
		const { container } = render(EnvironmentBadge, { environment: 'staging', floating: false });
		expect(container.querySelector('[data-environment]')?.className).not.toContain('fixed');
	});
});
