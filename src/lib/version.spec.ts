import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
	it('is the package.json version', () => {
		expect(APP_VERSION).toBe(pkg.version);
	});

	it('is a plain x.y.z semver', () => {
		expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
