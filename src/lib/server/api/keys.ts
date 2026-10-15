import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { can, PERMISSIONS, type Permission } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { users } from '../auth/schema';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { resolveSessionUser } from '../directory';
import { failure, success, type Outcome } from '../shared/outcome';
import { generateKey, hashKey, isWellFormed, startOf } from './key-format';
import { apiKeys, serviceAccounts, type ApiKey } from './schema';
import {
	validateCreateApiKey,
	type CreateApiKeyInput,
	type InvalidApiKeyInput
} from './validation';

export type { CreateApiKeyInput } from './validation';

/**
 * API key lifecycle (ADR 0022): create, list, revoke, and resolve a presented
 * key into the principal it acts as.
 *
 * Authorisation here is two-layered, like the other domains. The route gates
 * the capability (`api.keys.manage`); a function that is reached without it
 * throws, because that is a programming error. Which keys a person then sees
 * or revokes is data, decided here.
 */

const DAY_MS = 86_400_000;
const LAST_USED_THROTTLE_MS = 60_000;

/** What a screen is shown about a key. Never the plaintext, never the hash. */
export interface ApiKeyView {
	id: string;
	name: string;
	start: string;
	scopes: Permission[];
	/** Null for a service-account key. */
	ownerUserId: string | null;
	/** Set instead of the owner for a service-account key. */
	serviceAccountId: string | null;
	/** The person's name, or the service account's. */
	ownerName: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
}

export type CreateApiKeyFailure = InvalidApiKeyInput | 'duplicate_name';
/** The principal a key acts as: its owner (a user or a service account), narrowed to the key's scopes. */
export type ApiPrincipal = SessionUser & { scopes: readonly Permission[]; keyId: string };

export type AuthenticateFailure = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'disabled';

function requireManage(actor: SessionUser): void {
	// A service account is an API principal with no user behind it: it has no
	// "own" keys, and the API serves no key endpoints (ADR 0022).
	if (actor.serviceAccountId) {
		throw new Error('A service account cannot manage API keys.');
	}
	if (!can(actor, 'api.keys.manage')) {
		throw new Error(
			`The ${actor.role} role cannot manage API keys; the route should have called requirePermission first.`
		);
	}
}

/** Which keys `actor` may act on: every key in the organisation for `api.keys.manage.all`, else their own. */
function withinReach(actor: SessionUser) {
	return and(
		eq(apiKeys.organisationId, actor.organisationId),
		can(actor, 'api.keys.manage.all') ? undefined : eq(apiKeys.ownerUserId, actor.id)
	);
}

/** Stored scopes are strings; a permission retired since is dropped, never trusted. */
function knownScopes(scopes: readonly string[]): Permission[] {
	return scopes.filter((scope): scope is Permission =>
		(PERMISSIONS as readonly string[]).includes(scope)
	);
}

const viewColumns = {
	id: apiKeys.id,
	name: apiKeys.name,
	start: apiKeys.start,
	scopes: apiKeys.scopes,
	ownerUserId: apiKeys.ownerUserId,
	serviceAccountId: apiKeys.serviceAccountId,
	ownerName: sql<string>`coalesce(${users.name}, ${serviceAccounts.name})`,
	createdAt: apiKeys.createdAt,
	lastUsedAt: apiKeys.lastUsedAt,
	expiresAt: apiKeys.expiresAt
};

/** Shared with `service-accounts.ts`, which creates keys of the same shape. */
export function toView(row: Omit<ApiKeyView, 'scopes'> & { scopes: string[] }): ApiKeyView {
	return { ...row, scopes: knownScopes(row.scopes) };
}

/**
 * Creates a personal key for `actor` and returns the plaintext **once**: only
 * its hash is stored, so nobody, this function included, can show it again.
 */
export async function createApiKey(
	actor: SessionUser,
	input: CreateApiKeyInput,
	now: Date = new Date()
): Promise<Outcome<{ key: string; record: ApiKeyView }, CreateApiKeyFailure>> {
	requireManage(actor);
	const valid = validateCreateApiKey(actor, can(actor, 'api.keys.manage.all'), input);
	if (!valid.ok) return valid;

	const key = generateKey();
	const expiresAt =
		valid.value.expiresInDays === null
			? null
			: new Date(now.getTime() + valid.value.expiresInDays * DAY_MS);

	try {
		const [row] = await getDb()
			.insert(apiKeys)
			.values({
				organisationId: actor.organisationId,
				ownerUserId: actor.id,
				createdByUserId: actor.id,
				name: valid.value.name,
				start: startOf(key),
				keyHash: hashKey(key),
				scopes: valid.value.scopes,
				expiresAt
			})
			.returning();

		return success({
			key,
			record: toView({ ...row, ownerName: actor.name })
		});
	} catch (error) {
		if (uniqueConstraintName(error) === 'api_keys_owner_active_name') {
			return failure('duplicate_name');
		}
		throw error;
	}
}

/**
 * The viewer's own active keys, or every active key in the organisation for
 * whoever holds `api.keys.manage.all`. Revoked and expired keys keep their rows
 * but are not listed.
 */
export async function listApiKeys(
	viewer: SessionUser,
	now: Date = new Date()
): Promise<ApiKeyView[]> {
	requireManage(viewer);

	const rows = await getDb()
		.select(viewColumns)
		.from(apiKeys)
		.leftJoin(users, eq(users.id, apiKeys.ownerUserId))
		.leftJoin(serviceAccounts, eq(serviceAccounts.id, apiKeys.serviceAccountId))
		.where(
			and(
				withinReach(viewer),
				isNull(apiKeys.revokedAt),
				or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
			)
		)
		.orderBy(desc(apiKeys.createdAt), asc(apiKeys.id));

	return rows.map(toView);
}

/**
 * The owner revokes their own key; `api.keys.manage.all` revokes any key in the
 * organisation. Everything else, including a key that is already revoked, is
 * `not_found`: confirming that someone else's key exists is itself a leak.
 */
export async function revokeApiKey(
	actor: SessionUser,
	id: string,
	now: Date = new Date()
): Promise<Outcome<void, 'not_found'>> {
	requireManage(actor);

	const revoked = await getDb()
		.update(apiKeys)
		.set({ revokedAt: now, updatedAt: now })
		.where(and(eq(apiKeys.id, id), withinReach(actor), isNull(apiKeys.revokedAt)))
		.returning({ id: apiKeys.id });

	return revoked.length === 0 ? failure('not_found') : success(undefined);
}

/**
 * Who a key acts as. A personal key is its owner, who must still have a directory
 * record (ADR 0004). A service-account key is the account: no person, no email,
 * and a disabled account answers like any other dead credential.
 */
async function principalOf(
	key: ApiKey
): Promise<
	Outcome<SessionUser, Exclude<AuthenticateFailure, 'malformed' | 'revoked' | 'expired'>>
> {
	if (key.serviceAccountId) {
		const [account] = await getDb()
			.select()
			.from(serviceAccounts)
			.where(eq(serviceAccounts.id, key.serviceAccountId));
		if (!account) return failure('unknown');
		if (account.disabledAt) return failure('disabled');
		return success({
			id: account.id,
			serviceAccountId: account.id,
			name: account.name,
			email: '',
			role: account.role,
			organisationId: account.organisationId,
			personId: null
		});
	}

	const owner = key.ownerUserId ? await resolveSessionUser(key.ownerUserId) : null;
	// A credential with no directory record cannot act on anything (ADR 0004).
	return owner ? success(owner) : failure('unknown');
}

/**
 * Resolves a presented key into the principal it acts as: its owner, with the
 * key's scopes attached so `can()` intersects them with the owner's role on
 * every request (ADR 0022).
 *
 * `last_used_at` is stamped at most once a minute per key, because writing it on
 * every request would turn each read into a write.
 */
export async function authenticateApiKey(
	raw: string,
	now: Date = new Date()
): Promise<Outcome<ApiPrincipal, AuthenticateFailure>> {
	if (!isWellFormed(raw)) return failure('malformed');

	const [key] = await getDb()
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.keyHash, hashKey(raw)));
	if (!key) return failure('unknown');
	if (key.revokedAt) return failure('revoked');
	if (key.expiresAt && key.expiresAt <= now) return failure('expired');

	const principal = await principalOf(key);
	if (!principal.ok) return principal;

	await getDb()
		.update(apiKeys)
		.set({ lastUsedAt: now })
		.where(
			and(
				eq(apiKeys.id, key.id),
				or(
					isNull(apiKeys.lastUsedAt),
					lt(apiKeys.lastUsedAt, new Date(now.getTime() - LAST_USED_THROTTLE_MS))
				)
			)
		);

	return success({ ...principal.value, scopes: knownScopes(key.scopes), keyId: key.id });
}
