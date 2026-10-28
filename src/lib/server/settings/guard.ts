import { error } from '@sveltejs/kit';
import { permissionsOf } from '../access/permissions';
import { requireUser, type SessionUser } from '../auth/guards';
import { isSsoConfigured } from '../auth/oidc';
import { SETTINGS_SECTIONS, visibleSections } from '../../settings/sections';

/**
 * The Settings area's guards (ADR 0015 addendum, #123).
 *
 * Denials here are **403**, not the 404 `requirePermission` answers: the
 * `/settings` URLs are public knowledge (the registry is in the client bundle,
 * and the sidebar link exists for anyone who may use it), so there is nothing to
 * hide, and a 403 tells a signed-in person the page exists but is not theirs.
 */

/** What this installation has, read once per request from its environment. */
export function installationFeatures() {
	return { sso: isSsoConfigured() } as const;
}

/** `/settings/*`: at least one registry section must be visible to the viewer. */
export function requireSettingsAccess(user: SessionUser | null): SessionUser {
	const authenticated = requireUser(user);
	if (
		visibleSections(permissionsOf(authenticated), SETTINGS_SECTIONS, installationFeatures())
			.length === 0
	) {
		error(403, 'Forbidden');
	}
	return authenticated;
}

/** One section's page and each of its actions: the registry entry's own permission. */
export function requireSettingsSection(user: SessionUser | null, href: string): SessionUser {
	const authenticated = requireSettingsAccess(user);
	const section = SETTINGS_SECTIONS.find((candidate) => candidate.href === href);
	if (!section) throw new Error(`No settings section registered at ${href}.`);
	if (!visibleSections(permissionsOf(authenticated), [section], installationFeatures()).length) {
		error(403, 'Forbidden');
	}
	return authenticated;
}
