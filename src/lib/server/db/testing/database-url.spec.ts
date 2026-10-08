import { describe, expect, it } from 'vitest';
import { assertTestDatabase, databaseName, maintenanceDatabaseUrl } from './database-url';

const TEST_URL = 'postgres://unitati:unitati@localhost:5432/unitati_test';
const DEV_URL = 'postgres://unitati:unitati@localhost:5432/unitati';

describe('databaseName', () => {
	it('reads the database out of a connection string', () => {
		expect(databaseName(TEST_URL)).toBe('unitati_test');
	});

	it('ignores query parameters', () => {
		expect(databaseName(`${TEST_URL}?sslmode=require`)).toBe('unitati_test');
	});

	it('returns an empty name when the URL points at no database', () => {
		expect(databaseName('postgres://unitati@localhost:5432')).toBe('');
	});
});

describe('assertTestDatabase', () => {
	it('accepts a database whose name ends in _test', () => {
		expect(assertTestDatabase(TEST_URL)).toBe(TEST_URL);
	});

	it('rejects the development database, naming it in the message', () => {
		expect(() => assertTestDatabase(DEV_URL)).toThrow(/"unitati"/);
	});

	it('rejects a name that merely contains "test"', () => {
		expect(() => assertTestDatabase('postgres://unitati@localhost:5432/test_fixtures')).toThrow(
			/must end in "_test"/
		);
	});

	it('rejects an empty value rather than connecting to a default', () => {
		expect(() => assertTestDatabase('')).toThrow(/DATABASE_URL is not set/);
	});

	it('rejects a value that is not a URL', () => {
		expect(() => assertTestDatabase('unitati_test')).toThrow(/is not a URL/);
	});
});

describe('maintenanceDatabaseUrl', () => {
	it('repoints the connection at the maintenance database', () => {
		expect(maintenanceDatabaseUrl(TEST_URL)).toBe(
			'postgres://unitati:unitati@localhost:5432/postgres'
		);
	});

	it('keeps credentials and query parameters', () => {
		expect(maintenanceDatabaseUrl(`${TEST_URL}?sslmode=require`)).toBe(
			'postgres://unitati:unitati@localhost:5432/postgres?sslmode=require'
		);
	});
});
