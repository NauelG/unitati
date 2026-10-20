import { describe, expect, it } from 'vitest';
import {
	passwordChangeRedirect,
	requireAnyPermission,
	requireUser,
	type SessionUser
} from './guards';

const user = (role: SessionUser['role']): SessionUser => ({
	id: 'u1',
	name: 'Ada Lovelace',
	email: 'ada@acme.test',
	role,
	organisationId: 'o1',
	personId: 'p1'
});

/** SvelteKit's `error()` and `redirect()` throw; the thrown value carries the status. */
function statusOf(run: () => unknown): number | undefined {
	try {
		run();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return undefined;
}

describe('requireAnyPermission', () => {
	it('lets through a user who holds any one of the permissions', () => {
		const employee = user('employee');

		expect(requireAnyPermission(employee, ['assets.view', 'assets.view.shared'])).toBe(employee);
	});

	it('answers 404, not 403, when the user holds none of them', () => {
		expect(statusOf(() => requireAnyPermission(user('employee'), ['assets.manage']))).toBe(404);
	});

	it('sends an anonymous visitor to the login screen', () => {
		expect(statusOf(() => requireAnyPermission(null, ['assets.view']))).toBe(303);
	});

	it('refuses to guard with an empty list rather than let everybody in', () => {
		expect(() => requireAnyPermission(user('admin'), [])).toThrow(/at least one/);
	});
});

describe('passwordChangeRedirect', () => {
	const forced = { ...user('technician'), mustChangePassword: true };

	it('sends a session with a temporary password to the change page from anywhere else', () => {
		expect(passwordChangeRedirect(forced, '/')).toBe('/account/password');
		expect(passwordChangeRedirect(forced, '/tickets/abc')).toBe('/account/password');
		expect(passwordChangeRedirect(forced, '/login')).toBe('/account/password');
	});

	it('lets it reach the page itself, sign-out and assets', () => {
		expect(passwordChangeRedirect(forced, '/account/password')).toBeNull();
		expect(passwordChangeRedirect(forced, '/sign-out')).toBeNull();
		expect(passwordChangeRedirect(forced, '/_app/immutable/chunk.js')).toBeNull();
	});

	it('leaves everyone else alone', () => {
		expect(passwordChangeRedirect(user('admin'), '/')).toBeNull();
		expect(passwordChangeRedirect(null, '/')).toBeNull();
	});
});

describe('requireUser', () => {
	const locationOf = (run: () => unknown): string | undefined => {
		try {
			run();
		} catch (thrown) {
			return (thrown as { location?: string }).location;
		}
		return undefined;
	};

	it('sends an anonymous visitor to the login with the page they were going to', () => {
		const url = new URL('http://localhost/service-desk/TCK-0001?tab=x');
		expect(locationOf(() => requireUser(null, url))).toBe(
			'/login?redirectTo=%2Fservice-desk%2FTCK-0001%3Ftab%3Dx'
		);
	});

	it('sends them to a bare login when there is no target', () => {
		expect(locationOf(() => requireUser(null))).toBe('/login');
		expect(locationOf(() => requireUser(null, new URL('http://localhost/')))).toBe('/login');
	});
});
