import { describe, expect, it } from 'vitest';
import { assertLocalDatabase, RefusedSeedError } from './guard';

describe('assertLocalDatabase', () => {
	it.each([
		'postgres://unitati:unitati@localhost:5432/unitati',
		'postgres://unitati:unitati@127.0.0.1:5432/unitati',
		'postgres://unitati:unitati@[::1]:5432/unitati'
	])('allows %s', (url) => {
		expect(() => assertLocalDatabase(url)).not.toThrow();
	});

	it.each([
		'postgres://u:p@db.internal:5432/unitati_staging',
		'postgres://u:p@10.0.0.4:5432/unitati',
		// A hostname that merely *starts* with a local one is somebody else's machine.
		'postgres://u:p@localhost.example.com:5432/unitati'
	])('refuses %s', (url) => {
		expect(() => assertLocalDatabase(url)).toThrow(RefusedSeedError);
	});

	it('refuses a value that is not a URL rather than guessing', () => {
		expect(() => assertLocalDatabase('not a url')).toThrow(RefusedSeedError);
	});
});
