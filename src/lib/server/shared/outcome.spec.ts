import { describe, expect, it } from 'vitest';
import { failure, success, type Outcome } from './outcome';

describe('outcome', () => {
	it('wraps a successful value', () => {
		expect(success(42)).toEqual({ ok: true, value: 42 });
	});

	it('wraps a typed business failure', () => {
		const result: Outcome<number, 'not-found'> = failure('not-found');
		expect(result).toEqual({ ok: false, error: 'not-found' });
	});
});
