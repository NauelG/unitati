import { describe, expect, it } from 'vitest';
import { isProduction, parseAppEnvironment } from './environment.js';

describe('parseAppEnvironment', () => {
	it.each(['development', 'staging', 'production'] as const)('accepts %s', (value) => {
		expect(parseAppEnvironment(value, 'production')).toBe(value);
	});

	it('falls back when the variable is unset or empty', () => {
		expect(parseAppEnvironment(undefined, 'development')).toBe('development');
		expect(parseAppEnvironment('', 'production')).toBe('production');
	});

	it('rejects a value outside the vocabulary instead of guessing', () => {
		expect(() => parseAppEnvironment('prod', 'production')).toThrow(/APP_ENV must be one of/);
	});
});

describe('isProduction', () => {
	it('is true only for production', () => {
		expect(isProduction('production')).toBe(true);
		expect(isProduction('staging')).toBe(false);
		expect(isProduction('development')).toBe(false);
	});
});
