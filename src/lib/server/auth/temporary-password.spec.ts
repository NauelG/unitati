import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from './temporary-password';

describe('generateTemporaryPassword', () => {
	it('is 16 characters from an alphabet without look-alikes', () => {
		for (let i = 0; i < 200; i += 1) {
			const password = generateTemporaryPassword();
			expect(password).toHaveLength(16);
			expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
		}
	});

	it('does not repeat', () => {
		const seen = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
		expect(seen.size).toBe(100);
	});
});
