import { eq } from 'drizzle-orm';
import type { SSOUserResolution, SSOUserResolutionInput } from '@better-auth/sso';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import {
	linkPersonToUser,
	organisationIdOfUser,
	resolveSsoIdentity,
	soleOrganisationId,
	type SsoRefusal
} from '../directory';
import { getAuthenticationSettings } from './settings';
import { ssoProviderKey } from './oidc';
import { users } from './schema';

/**
 * What the sign-in callback does with a verified identity (ADR 0056): the
 * `resolveUser` hook of `@better-auth/sso`. Better Auth owns the OAuth dance,
 * the ID-token verification and the session; whether this identity is allowed
 * in, and as whom, is decided here, through the directory's public functions.
 */

/** The `?error=` codes the error page words. Stable: they travel in a URL. */
export const SSO_ERROR_CODES = [
	'email_not_verified',
	'person_inactive',
	'no_person',
	'email_taken',
	'sso_unavailable'
] as const;
export type SsoErrorCode = (typeof SSO_ERROR_CODES)[number];

const REFUSALS: Record<SsoRefusal, SsoErrorCode> = {
	email_not_verified: 'email_not_verified',
	inactive: 'person_inactive',
	no_person: 'no_person',
	email_taken: 'email_taken'
};

export function isSsoErrorCode(value: string | null | undefined): value is SsoErrorCode {
	return SSO_ERROR_CODES.some((code) => code === value);
}

function claimIsTrue(value: unknown): boolean {
	return value === true || value === 'true';
}

function claimText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

const reject = (code: SsoErrorCode): SSOUserResolution => ({ action: 'reject', code });

export async function resolveSsoUser(input: SSOUserResolutionInput): Promise<SSOUserResolution> {
	const provider = ssoProviderKey();
	if (!provider || input.protocol !== 'oidc') return reject('sso_unavailable');

	const organisationId = await soleOrganisationId();
	if (!organisationId) return reject('sso_unavailable');

	// `email_verified` is read from the signed ID token, never from the userinfo
	// response and never assumed: it is what lets an email stand for an identity.
	// It vouches for the token's own address, so a token without one vouches for
	// nothing and an address that only the userinfo response carries is unverified.
	const token = input.verifiedIdTokenClaims;
	const tokenEmail = claimText(token.email);
	const claims = {
		provider,
		externalId: input.accountKey.accountId,
		email: tokenEmail || input.providerUser.email,
		emailVerified: tokenEmail !== '' && claimIsTrue(token.email_verified),
		fullName: input.providerUser.name
	};
	const { jitProvisioning } = await getAuthenticationSettings(organisationId);

	try {
		return await getDb().transaction(async (tx): Promise<SSOUserResolution> => {
			const resolved = await resolveSsoIdentity(tx, organisationId, claims, { jitProvisioning });
			// Returned, not thrown: a refusal may have recorded a warning that must commit.
			if (!resolved.ok) return reject(REFUSALS[resolved.error]);

			const person = resolved.value;
			let userId = person.userId;
			if (userId === null) {
				userId = crypto.randomUUID();
				await tx.insert(users).values({
					id: userId,
					name: person.fullName,
					email: person.email.toLowerCase(),
					emailVerified: claims.emailVerified,
					role: 'employee'
				});
				await linkPersonToUser(tx, person.personId, userId);
			} else {
				// One transaction with the directory record: the sign-in address never lags behind it.
				await tx
					.update(users)
					.set({ name: person.fullName, email: person.email.toLowerCase(), updatedAt: new Date() })
					.where(eq(users.id, userId));
			}
			return { action: 'link', userId, profile: 'preserve' };
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return reject('email_taken');
		throw error;
	}
}

/**
 * While SSO is required only an admin may open a password session
 * (ADR 0056); everyone else answers to the identity provider. Anyone with no
 * person yet (the first admin, mid-setup) is not held back.
 */
export async function passwordSignInRefused(userId: string): Promise<boolean> {
	// A credential with no person yet still answers to the installation's organisation.
	const organisationId = (await organisationIdOfUser(userId)) ?? (await soleOrganisationId());
	if (!organisationId) return false;

	const { ssoRequired } = await getAuthenticationSettings(organisationId);
	if (!ssoRequired) return false;

	const [user] = await getDb()
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return user?.role !== 'admin';
}
