import { and, asc, eq, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { users } from '../auth/schema';
import type { UserRole } from '../auth/schema';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { generateKey, hashKey, startOf } from './key-format';
import { toView, type ApiKeyView, type CreateApiKeyFailure } from './keys';
import { apiKeys, serviceAccounts } from './schema';
import {
	validateCreateApiKey,
	validateCreateServiceAccount,
	type CreateApiKeyInput,
	type InvalidServiceAccountInput
} from './validation';

/**
 * Service accounts (ADR 0022): organisation-owned principals with a product role
 * and no person. Only whoever holds `api.keys.manage.all` manages them; a
 * function reached without it throws, because the route should have gated it.
 *
 * They are disabled, never deleted: the activity they wrote keeps naming them.
 */

const DAY_MS = 86_400_000;

export type CreateServiceAccountFailure = InvalidServiceAccountInput | 'duplicate_name';
export type CreateServiceAccountKeyFailure = CreateApiKeyFailure | 'not_found' | 'account_disabled';

/** What a screen is shown about a service account. */
export interface ServiceAccountView {
	id: string;
	name: string;
	role: UserRole;
	createdByName: string | null;
	createdAt: Date;
	disabledAt: Date | null;
	/** Keys that still authenticate: neither revoked nor expired. */
	activeKeys: number;
}

function requireManageAll(actor: SessionUser): void {
	if (actor.serviceAccountId || !can(actor, 'api.keys.manage.all')) {
		throw new Error(
			`The ${actor.role} role cannot manage service accounts; the route should have called requirePermission first.`
		);
	}
}

export async function createServiceAccount(
	actor: SessionUser,
	input: { name: string; role: string }
): Promise<Outcome<ServiceAccountView, CreateServiceAccountFailure>> {
	requireManageAll(actor);
	const valid = validateCreateServiceAccount(input);
	if (!valid.ok) return valid;

	try {
		const [row] = await getDb()
			.insert(serviceAccounts)
			.values({
				organisationId: actor.organisationId,
				name: valid.value.name,
				role: valid.value.role,
				createdByUserId: actor.id
			})
			.returning();

		return success({
			id: row.id,
			name: row.name,
			role: row.role,
			createdByName: actor.name,
			createdAt: row.createdAt,
			disabledAt: null,
			activeKeys: 0
		});
	} catch (error) {
		if (uniqueConstraintName(error) === 'service_accounts_org_name') {
			return failure('duplicate_name');
		}
		throw error;
	}
}

/**
 * The name of one service account, for a record that names who acted (a
 * handover document's issuer). Ungated: it is a label, read by the domain that
 * already holds the id, never a way to list accounts.
 */
export async function serviceAccountName(
	organisationId: string,
	id: string
): Promise<string | null> {
	const [row] = await getDb()
		.select({ name: serviceAccounts.name })
		.from(serviceAccounts)
		.where(and(eq(serviceAccounts.id, id), eq(serviceAccounts.organisationId, organisationId)))
		.limit(1);
	return row?.name ?? null;
}

/** Every service account in the organisation, enabled ones first. */
export async function listServiceAccounts(
	viewer: SessionUser,
	now: Date = new Date()
): Promise<ServiceAccountView[]> {
	requireManageAll(viewer);

	return getDb()
		.select({
			id: serviceAccounts.id,
			name: serviceAccounts.name,
			role: serviceAccounts.role,
			createdByName: users.name,
			createdAt: serviceAccounts.createdAt,
			disabledAt: serviceAccounts.disabledAt,
			activeKeys: sql<number>`(
				select count(*)::int from ${apiKeys}
				where ${apiKeys.serviceAccountId} = ${serviceAccounts.id}
					and ${apiKeys.revokedAt} is null
					and (${apiKeys.expiresAt} is null or ${apiKeys.expiresAt} > ${now.toISOString()}::timestamptz)
			)`
		})
		.from(serviceAccounts)
		.leftJoin(users, eq(users.id, serviceAccounts.createdByUserId))
		.where(eq(serviceAccounts.organisationId, viewer.organisationId))
		.orderBy(
			sql`${serviceAccounts.disabledAt} is not null`,
			asc(sql`lower(${serviceAccounts.name})`),
			asc(serviceAccounts.id)
		);
}

/**
 * Disabling is the only way out of a service account. While disabled, every one
 * of its keys answers 401; enabling restores them. Idempotent.
 */
export async function setServiceAccountDisabled(
	actor: SessionUser,
	id: string,
	disabled: boolean,
	now: Date = new Date()
): Promise<Outcome<void, 'not_found'>> {
	requireManageAll(actor);

	const updated = await getDb()
		.update(serviceAccounts)
		.set({ disabledAt: disabled ? now : null, updatedAt: now })
		.where(
			and(eq(serviceAccounts.id, id), eq(serviceAccounts.organisationId, actor.organisationId))
		)
		.returning({ id: serviceAccounts.id });

	return updated.length === 0 ? failure('not_found') : success(undefined);
}

/**
 * Creates a key for a service account and returns the plaintext **once**. The
 * scopes offered are those of the *account's* role, not the admin's: the key is
 * the account's credential and acts as it.
 */
export async function createServiceAccountKey(
	actor: SessionUser,
	serviceAccountId: string,
	input: CreateApiKeyInput,
	now: Date = new Date()
): Promise<Outcome<{ key: string; record: ApiKeyView }, CreateServiceAccountKeyFailure>> {
	requireManageAll(actor);

	const [account] = await getDb()
		.select()
		.from(serviceAccounts)
		.where(
			and(
				eq(serviceAccounts.id, serviceAccountId),
				eq(serviceAccounts.organisationId, actor.organisationId)
			)
		);
	if (!account) return failure('not_found');
	if (account.disabledAt) return failure('account_disabled');

	const valid = validateCreateApiKey(account, true, input);
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
				serviceAccountId: account.id,
				createdByUserId: actor.id,
				name: valid.value.name,
				start: startOf(key),
				keyHash: hashKey(key),
				scopes: valid.value.scopes,
				expiresAt
			})
			.returning();

		return success({ key, record: toView({ ...row, ownerName: account.name }) });
	} catch (error) {
		if (uniqueConstraintName(error) === 'api_keys_owner_active_name') {
			return failure('duplicate_name');
		}
		throw error;
	}
}
