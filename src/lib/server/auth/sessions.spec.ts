import { describe, expect, it } from 'vitest';
import { SSO_SESSION_SECONDS, ssoSessionExpiry, ssoSessionLapsed } from './sessions';

const CREATED = new Date('2026-01-01T08:00:00Z');

describe('SSO session lifetime', () => {
	it('lasts twelve hours from creation', () => {
		expect(SSO_SESSION_SECONDS).toBe(43_200);
		expect(ssoSessionExpiry(CREATED).toISOString()).toBe('2026-01-01T20:00:00.000Z');
	});

	it('is alive just before the twelfth hour and lapsed at it', () => {
		const session = { authMethod: 'sso', createdAt: CREATED };
		expect(ssoSessionLapsed(session, new Date('2026-01-01T19:59:59Z'))).toBe(false);
		expect(ssoSessionLapsed(session, new Date('2026-01-01T20:00:00Z'))).toBe(true);
	});

	it('never lapses a password session by this rule', () => {
		expect(
			ssoSessionLapsed(
				{ authMethod: 'password', createdAt: CREATED },
				new Date('2026-03-01T00:00:00Z')
			)
		).toBe(false);
	});
});
