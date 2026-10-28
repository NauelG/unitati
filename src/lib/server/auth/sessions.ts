import type { SessionAuthMethod } from './schema';

/**
 * How long an SSO session lives (ADR 0056): twelve hours from creation, never
 * refreshed, so a leaver loses access within a working day even without SCIM.
 * A password session keeps Better Auth's 30 days, refreshed.
 */
export const SSO_SESSION_SECONDS = 60 * 60 * 12;

export function ssoSessionExpiry(from: Date): Date {
	return new Date(from.getTime() + SSO_SESSION_SECONDS * 1000);
}

/**
 * True when an SSO session is past its twelve hours, whatever `expires_at` says.
 * Better Auth's refresh would push `expires_at` out, so the creation time is the
 * authority and this is checked on every request.
 */
export function ssoSessionLapsed(
	session: { authMethod?: SessionAuthMethod | string | null; createdAt: Date },
	now: Date = new Date()
): boolean {
	return session.authMethod === 'sso' && ssoSessionExpiry(session.createdAt) <= now;
}
