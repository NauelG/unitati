import { describe, expect, it } from 'vitest';
import { isApiPath } from './authenticate-request';

describe('isApiPath', () => {
	it('claims /api/v1 and everything below it', () => {
		expect(isApiPath('/api/v1')).toBe(true);
		expect(isApiPath('/api/v1/tickets')).toBe(true);
	});

	it('leaves every other path to the session', () => {
		for (const path of [
			'/',
			'/service-desk',
			'/api/auth/sign-in',
			'/api/palette',
			'/api/v10/x',
			'/api/v1x'
		]) {
			expect(isApiPath(path)).toBe(false);
		}
	});
});
