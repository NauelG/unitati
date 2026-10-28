import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb, type Transaction } from '../db';
import type { SessionUser } from '../auth/guards';
import { actorColumns, recordActivity } from '../activity';
import { failure, success, type Outcome } from '../shared/outcome';
import { organisations, people, personIdentities, provisioningWarnings } from './schema';

/**
 * Single sign-on identities (ADR 0056): who an identity provider's account is
 * in the directory. The `auth` domain calls these from the sign-in callback; it
 * never reads `people` or `person_identities` itself (ADR 0002).
 *
 * Every function that writes takes the caller's transaction, so the identity,
 * the credential `auth` creates beside it and the history commit together.
 */

/** What the identity provider says about the person who just authenticated. */
export interface SsoClaims {
	/** `oidc:<issuer>`. */
	provider: string;
	/** The `sub` claim, compared case-sensitively. */
	externalId: string;
	email: string;
	/** The ID token's `email_verified`, read from the token and never assumed. */
	emailVerified: boolean;
	fullName: string;
}

export type SsoRefusal = 'email_not_verified' | 'inactive' | 'no_person' | 'email_taken';

export interface ResolvedPerson {
	organisationId: string;
	personId: string;
	/** The credential that signs in as this person; null until `auth` creates one. */
	userId: string | null;
	fullName: string;
	email: string;
	/** True when this sign-in created the person (JIT provisioning). */
	created: boolean;
}

const MAX_NAME = 120;

function cleanName(fullName: string, email: string): string {
	const name = fullName.trim().slice(0, MAX_NAME);
	return name !== '' ? name : (email.split('@')[0] ?? email);
}

/**
 * The organisation a sign-in belongs to. Exactly one exists today (ADR 0004);
 * the oldest is the answer until a second one makes the provider say which.
 */
export async function soleOrganisationId(): Promise<string | null> {
	const [row] = await getDb()
		.select({ id: organisations.id })
		.from(organisations)
		.orderBy(asc(organisations.createdAt))
		.limit(1);
	return row?.id ?? null;
}

/** The organisation a credential works in, or null when it has no person. */
export async function organisationIdOfUser(userId: string): Promise<string | null> {
	const [row] = await getDb()
		.select({ organisationId: people.organisationId })
		.from(people)
		.where(eq(people.userId, userId))
		.limit(1);
	return row?.organisationId ?? null;
}

/** Every credential in an organisation, so `auth` can act on its sessions without reading `people`. */
export async function userIdsInOrganisation(
	tx: Transaction,
	organisationId: string
): Promise<string[]> {
	const rows = await tx
		.select({ userId: people.userId })
		.from(people)
		.where(eq(people.organisationId, organisationId));
	return rows.flatMap((row) => (row.userId === null ? [] : [row.userId]));
}

async function personByEmail(tx: Transaction, organisationId: string, email: string) {
	const [row] = await tx
		.select({ id: people.id, active: people.active })
		.from(people)
		.where(
			and(eq(people.organisationId, organisationId), sql`lower(${people.email}) = lower(${email})`)
		)
		.limit(1);
	return row ?? null;
}

async function refuseEmailTaken(
	tx: Transaction,
	organisationId: string,
	claims: SsoClaims,
	holderPersonId: string
): Promise<Outcome<never, 'email_taken'>> {
	await tx
		.insert(provisioningWarnings)
		.values({
			organisationId,
			provider: claims.provider,
			externalId: claims.externalId,
			kind: 'email_taken',
			detail: { email: claims.email, personId: holderPersonId }
		})
		// One open warning per identity and kind: a repeated sign-in adds nothing.
		.onConflictDoNothing();
	return failure('email_taken');
}

/**
 * Resolves an authenticated identity to a person, in this order (ADR 0056):
 *
 * 1. a link `(provider, sub)` → that person;
 * 2. no link, a verified email, an active person with that address and no link
 *    for this provider → link them, once;
 * 3. no match and JIT provisioning on → create the person and the link;
 * 4. otherwise → refuse.
 *
 * Then an inactive person is refused, and the IdP's name and email are written
 * onto the directory record (the IdP is authoritative for both). A refusal is
 * a returned value, not a throw: the warning it records must commit.
 */
export async function resolveSsoIdentity(
	tx: Transaction,
	organisationId: string,
	rawClaims: SsoClaims,
	options: { jitProvisioning: boolean }
): Promise<Outcome<ResolvedPerson, SsoRefusal>> {
	const claims: SsoClaims = { ...rawClaims, email: rawClaims.email.trim().toLowerCase() };

	const [linked] = await tx
		.select({ personId: personIdentities.personId })
		.from(personIdentities)
		.where(
			and(
				eq(personIdentities.organisationId, organisationId),
				eq(personIdentities.provider, claims.provider),
				eq(personIdentities.externalId, claims.externalId)
			)
		)
		.limit(1);

	let personId: string;
	let created = false;

	if (linked) {
		personId = linked.personId;
	} else {
		// Never a link and never a person without a verified address: an unverified
		// claim could be anyone's.
		if (!claims.emailVerified) return failure('email_not_verified');

		const holder = await personByEmail(tx, organisationId, claims.email);
		if (holder) {
			const [theirLink] = await tx
				.select({ id: personIdentities.id })
				.from(personIdentities)
				.where(
					and(
						eq(personIdentities.personId, holder.id),
						eq(personIdentities.provider, claims.provider)
					)
				)
				.limit(1);
			// The address belongs to someone the IdP already knows under another identity.
			if (theirLink) return refuseEmailTaken(tx, organisationId, claims, holder.id);
			if (!holder.active) return failure('inactive');

			await tx.insert(personIdentities).values({
				organisationId,
				personId: holder.id,
				provider: claims.provider,
				externalId: claims.externalId
			});
			await recordActivity(tx, {
				organisationId,
				actorPersonId: holder.id,
				target: { personId: holder.id },
				verb: 'person.identity.linked',
				payload: { provider: claims.provider, via: 'email' }
			});
			personId = holder.id;
		} else if (options.jitProvisioning) {
			const fullName = cleanName(claims.fullName, claims.email);
			const [row] = await tx
				.insert(people)
				.values({ organisationId, fullName, email: claims.email })
				.returning({ id: people.id });
			await tx.insert(personIdentities).values({
				organisationId,
				personId: row.id,
				provider: claims.provider,
				externalId: claims.externalId
			});
			await recordActivity(tx, {
				organisationId,
				actorPersonId: row.id,
				target: { personId: row.id },
				verb: 'person.created',
				payload: { fullName, email: claims.email, via: 'sso' }
			});
			personId = row.id;
			created = true;
		} else {
			return failure('no_person');
		}
	}

	const [person] = await tx
		.select({
			fullName: people.fullName,
			email: people.email,
			active: people.active,
			userId: people.userId
		})
		.from(people)
		.where(eq(people.id, personId))
		.limit(1);
	if (!person.active) return failure('inactive');

	const changes: { fullName?: string; email?: string } = {};
	const fullName = cleanName(claims.fullName, claims.email);
	if (claims.fullName.trim() !== '' && fullName !== person.fullName) changes.fullName = fullName;
	// The address is only taken from a token that vouches for it.
	if (claims.emailVerified && claims.email !== person.email) {
		const [other] = await tx
			.select({ id: people.id })
			.from(people)
			.where(
				and(
					eq(people.organisationId, organisationId),
					ne(people.id, personId),
					sql`lower(${people.email}) = lower(${claims.email})`
				)
			)
			.limit(1);
		if (other) return refuseEmailTaken(tx, organisationId, claims, other.id);
		changes.email = claims.email;
	}
	if (Object.keys(changes).length > 0) {
		await tx
			.update(people)
			.set({ ...changes, updatedAt: new Date() })
			.where(eq(people.id, personId));
	}

	return success({
		organisationId,
		personId,
		userId: person.userId,
		fullName: changes.fullName ?? person.fullName,
		email: changes.email ?? person.email,
		created
	});
}

/** The provider a person signs in through, or null when they have no identity. */
export async function findPersonIdentity(
	organisationId: string,
	personId: string
): Promise<{ provider: string } | null> {
	const [row] = await getDb()
		.select({ provider: personIdentities.provider })
		.from(personIdentities)
		.where(
			and(
				eq(personIdentities.organisationId, organisationId),
				eq(personIdentities.personId, personId)
			)
		)
		.limit(1);
	return row ?? null;
}

/**
 * Removes a person's identity link, which makes their name and email editable
 * again (ADR 0056). Returns the credential, so `auth` can end its SSO sessions.
 */
export async function unlinkPersonIdentity(
	tx: Transaction,
	actor: SessionUser,
	personId: string
): Promise<Outcome<{ userId: string | null }, 'not_found' | 'not_linked'>> {
	const { organisationId } = actor;
	const [person] = await tx
		.select({ userId: people.userId })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
		.limit(1);
	if (!person) return failure('not_found');

	const removed = await tx
		.delete(personIdentities)
		.where(
			and(
				eq(personIdentities.organisationId, organisationId),
				eq(personIdentities.personId, personId)
			)
		)
		.returning({ provider: personIdentities.provider });
	if (removed.length === 0) return failure('not_linked');

	for (const { provider } of removed) {
		await recordActivity(tx, {
			organisationId,
			...actorColumns(actor),
			target: { personId },
			verb: 'person.identity.unlinked',
			payload: { provider }
		});
	}
	return success({ userId: person.userId });
}

export interface OpenProvisioningWarning {
	id: string;
	kind: 'email_taken';
	provider: string;
	externalId: string;
	email: string | null;
	/** The person who already holds the address, when it is still known. */
	holder: { id: string; fullName: string } | null;
	createdAt: Date;
}

/** The warnings an admin has not dismissed, newest first. */
export async function listOpenProvisioningWarnings(
	organisationId: string
): Promise<OpenProvisioningWarning[]> {
	const rows = await getDb()
		.select({
			id: provisioningWarnings.id,
			kind: provisioningWarnings.kind,
			provider: provisioningWarnings.provider,
			externalId: provisioningWarnings.externalId,
			detail: provisioningWarnings.detail,
			createdAt: provisioningWarnings.createdAt,
			holderId: people.id,
			holderName: people.fullName
		})
		.from(provisioningWarnings)
		.leftJoin(
			people,
			sql`${people.id}::text = ${provisioningWarnings.detail}->>'personId' and ${people.organisationId} = ${provisioningWarnings.organisationId}`
		)
		.where(
			and(
				eq(provisioningWarnings.organisationId, organisationId),
				isNull(provisioningWarnings.dismissedAt)
			)
		)
		.orderBy(sql`${provisioningWarnings.createdAt} desc`);

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		provider: row.provider,
		externalId: row.externalId,
		email: typeof row.detail.email === 'string' ? row.detail.email : null,
		holder: row.holderId && row.holderName ? { id: row.holderId, fullName: row.holderName } : null,
		createdAt: row.createdAt
	}));
}

/** Dismissing is not deleting: the row stays, so a later duplicate can open a new warning. */
export async function dismissProvisioningWarning(
	organisationId: string,
	warningId: string
): Promise<Outcome<void, 'not_found'>> {
	const dismissed = await getDb()
		.update(provisioningWarnings)
		.set({ dismissedAt: new Date() })
		.where(
			and(
				eq(provisioningWarnings.id, warningId),
				eq(provisioningWarnings.organisationId, organisationId),
				isNull(provisioningWarnings.dismissedAt)
			)
		)
		.returning({ id: provisioningWarnings.id });
	return dismissed.length === 0 ? failure('not_found') : success(undefined);
}
