import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { can } from '../access/permissions';
import { getDb } from '../db';
import { userIdsInOrganisation } from '../directory';
import { failure, success, type Outcome } from '../shared/outcome';
import type { SessionUser } from './guards';
import { isSsoConfigured } from './oidc';
import { authenticationSettings } from './authentication-settings-schema';
import { sessions, users } from './schema';

/**
 * What an admin tunes about sign-in (ADR 0056). Only meaningful while an
 * identity provider is configured in the environment; the rows exist either way
 * and a missing one means every default.
 */

export interface AuthenticationSettings {
	/** Null means the default label, which the screen words. */
	buttonLabel: string | null;
	jitProvisioning: boolean;
	ssoRequired: boolean;
	autoRedirect: boolean;
}

const DEFAULTS: AuthenticationSettings = {
	buttonLabel: null,
	jitProvisioning: false,
	ssoRequired: false,
	autoRedirect: false
};

export const BUTTON_LABEL_MAX = 40;

export const authenticationSettingsInput = z.object({
	buttonLabel: z
		.string()
		.trim()
		.max(BUTTON_LABEL_MAX)
		.nullish()
		.transform((value) => (value ? value : null)),
	jitProvisioning: z.boolean(),
	ssoRequired: z.boolean(),
	autoRedirect: z.boolean()
});

export type AuthenticationSettingsInput = z.output<typeof authenticationSettingsInput>;

/**
 * The settings in force. Without an identity provider in the environment every
 * one of them is off, whatever the database remembers: an installation that
 * drops its OIDC variables must not lock its staff out of the password form.
 */
export async function getAuthenticationSettings(
	organisationId: string
): Promise<AuthenticationSettings> {
	if (!isSsoConfigured()) return DEFAULTS;
	const [row] = await getDb()
		.select({
			buttonLabel: authenticationSettings.buttonLabel,
			jitProvisioning: authenticationSettings.jitProvisioning,
			ssoRequired: authenticationSettings.ssoRequired,
			autoRedirect: authenticationSettings.autoRedirect
		})
		.from(authenticationSettings)
		.where(eq(authenticationSettings.organisationId, organisationId))
		.limit(1);
	return row ?? DEFAULTS;
}

/**
 * Saves the settings. Turning SSO required on ends every password session of a
 * non-admin user in the same transaction and keeps their password hashes, so
 * turning it off restores password sign-in. Auto-redirect cannot outlive
 * SSO required: the database says the same.
 */
export async function updateAuthenticationSettings(
	actor: SessionUser,
	input: AuthenticationSettingsInput
): Promise<Outcome<void, 'forbidden'>> {
	if (!can(actor, 'organisation.manage')) return failure('forbidden');

	const next = { ...input, autoRedirect: input.ssoRequired && input.autoRedirect };
	const { organisationId } = actor;

	await getDb().transaction(async (tx) => {
		const [before] = await tx
			.select({ ssoRequired: authenticationSettings.ssoRequired })
			.from(authenticationSettings)
			.where(eq(authenticationSettings.organisationId, organisationId))
			.limit(1)
			.for('update');

		await tx
			.insert(authenticationSettings)
			.values({ organisationId, ...next })
			.onConflictDoUpdate({
				target: authenticationSettings.organisationId,
				set: { ...next, updatedAt: new Date() }
			});

		if (next.ssoRequired && !before?.ssoRequired) {
			const members = await userIdsInOrganisation(tx, organisationId);
			if (members.length === 0) return;
			const nonAdmins = await tx
				.select({ id: users.id })
				.from(users)
				.where(and(inArray(users.id, members), ne(users.role, 'admin')));
			if (nonAdmins.length === 0) return;
			await tx.delete(sessions).where(
				and(
					eq(sessions.authMethod, 'password'),
					inArray(
						sessions.userId,
						nonAdmins.map((user) => user.id)
					)
				)
			);
		}
	});
	return success(undefined);
}
