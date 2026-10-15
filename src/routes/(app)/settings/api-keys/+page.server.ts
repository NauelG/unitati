import { error, fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { SCOPE_GROUPS } from '#lib/settings/api-scopes.js';
import {
	DEFAULT_EXPIRY_DAYS,
	EXPIRY_DAYS,
	SERVICE_ACCOUNT_ROLES,
	createApiKey,
	createServiceAccount,
	createServiceAccountKey,
	listApiKeys,
	listServiceAccounts,
	revokeApiKey,
	setServiceAccountDisabled
} from '#lib/server/api/index.js';
import type {
	CreateApiKeyFailure,
	CreateServiceAccountFailure,
	CreateServiceAccountKeyFailure
} from '#lib/server/api/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { can, permissionsFor } from '#lib/server/access/permissions.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, rejected, withId } from '../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/api-keys';

/** The scopes a role holds, in checklist order: never one that role could not use. */
function grantableTo(role: SessionUser['role']) {
	const held = new Set(permissionsFor(role));
	return SCOPE_GROUPS.flatMap((group) => group.permissions).filter((p) => held.has(p));
}

/**
 * Service accounts are an administrator's: the section is visible to whoever may
 * manage keys, but its actions are gated here, and a refusal is the settings
 * area's 403 (the URL is public knowledge, so there is nothing to hide).
 */
function requireServiceAccountAdmin(user: SessionUser | null): SessionUser {
	const authenticated = requireSettingsSection(user, SECTION);
	if (!can(authenticated, 'api.keys.manage.all')) error(403, 'Forbidden');
	return authenticated;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const canManageAll = can(user, 'api.keys.manage.all');

	return {
		keys: (await listApiKeys(user)).map((key) => ({
			id: key.id,
			name: key.name,
			start: key.start,
			scopes: key.scopes,
			ownerName: key.ownerName,
			isServiceAccount: key.serviceAccountId !== null,
			createdAt: key.createdAt,
			lastUsedAt: key.lastUsedAt,
			expiresAt: key.expiresAt
		})),
		canManageAll,
		/** What the creator's role holds, in checklist order: never a scope that role could not use. */
		grantable: grantableTo(user.role),
		serviceAccounts: canManageAll
			? (await listServiceAccounts(user)).map((account) => ({
					id: account.id,
					name: account.name,
					role: account.role,
					createdByName: account.createdByName,
					activeKeys: account.activeKeys,
					disabled: account.disabledAt !== null,
					/** A service account's key is limited to *its* role, not the admin's. */
					grantable: grantableTo(account.role)
				}))
			: [],
		serviceAccountRoles: [...SERVICE_ACCOUNT_ROLES],
		expiryDays: [...EXPIRY_DAYS],
		defaultExpiryDays: DEFAULT_EXPIRY_DAYS
	};
};

type Field = 'name' | 'scopes' | 'expiresInDays';

const ACCOUNT_FAILURES: Record<
	CreateServiceAccountFailure,
	{ field: 'name' | 'role'; message: () => string }
> = {
	invalid_name: { field: 'name', message: m.service_accounts_error_name },
	duplicate_name: { field: 'name', message: m.service_accounts_error_duplicate },
	role_not_allowed: { field: 'role', message: m.service_accounts_error_role }
};

const FAILURES: Record<CreateApiKeyFailure, { field: Field; message: () => string }> = {
	invalid_name: { field: 'name', message: m.api_keys_error_name },
	duplicate_name: { field: 'name', message: m.api_keys_error_duplicate },
	no_scopes: { field: 'scopes', message: m.api_keys_error_no_scopes },
	scope_not_allowed: { field: 'scopes', message: m.api_keys_error_scope },
	invalid_expiry: { field: 'expiresInDays', message: m.api_keys_error_expiry },
	never_not_allowed: { field: 'expiresInDays', message: m.api_keys_error_never }
};

const KEY_FOR_ACCOUNT_FAILURES: Record<
	CreateServiceAccountKeyFailure,
	{ field: Field; message: () => string }
> = {
	...FAILURES,
	duplicate_name: { field: 'name', message: m.service_accounts_error_key_duplicate },
	not_found: { field: 'name', message: m.service_accounts_error_not_found },
	account_disabled: { field: 'name', message: m.service_accounts_error_disabled }
};

/** `"never"` is the one non-numeric expiry; anything else that is not a number fails validation. */
function expiryOf(raw: FormDataEntryValue | null): number | null {
	if (raw === 'never') return null;
	return typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
}

function keyInput(data: FormData) {
	return {
		name: String(data.get('name') ?? ''),
		scopes: data.getAll('scopes').filter((value) => typeof value === 'string'),
		expiresInDays: expiryOf(data.get('expiresInDays'))
	};
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();

		const outcome = await createApiKey(user, keyInput(data));

		if (!outcome.ok) {
			const { field, message } = FAILURES[outcome.error];
			return fail(400, { action: 'create', message: message(), id: null, field });
		}

		// The plaintext travels in this one response and is never stored: the page
		// reads it and drops it when the dialog closes.
		return { action: 'create' as const, message: null, id: null, key: outcome.value.key };
	},

	createAccount: async ({ locals, request }) => {
		const user = requireServiceAccountAdmin(locals.user);
		const data = await request.formData();

		const outcome = await createServiceAccount(user, {
			name: String(data.get('name') ?? ''),
			role: String(data.get('role') ?? '')
		});
		if (!outcome.ok) {
			const { field, message } = ACCOUNT_FAILURES[outcome.error];
			return fail(400, { action: 'createAccount', message: message(), id: null, field });
		}
		return { action: 'createAccount' as const, message: null, id: null };
	},

	setAccountDisabled: async ({ locals, request }) => {
		const user = requireServiceAccountAdmin(locals.user);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		if (!id.success) return rejected('setAccountDisabled', m.service_accounts_error_not_found());

		const outcome = await setServiceAccountDisabled(user, id.data.id, fields.disabled === 'true');
		if (!outcome.ok) {
			return rejected('setAccountDisabled', m.service_accounts_error_not_found(), id.data.id);
		}
		return { action: 'setAccountDisabled' as const, message: null, id: null };
	},

	createAccountKey: async ({ locals, request }) => {
		const user = requireServiceAccountAdmin(locals.user);
		const data = await request.formData();
		const account = withId.safeParse({ id: data.get('serviceAccountId') });
		if (!account.success) {
			return fail(400, {
				action: 'create',
				message: m.service_accounts_error_not_found(),
				id: null,
				field: 'name' as Field
			});
		}

		const outcome = await createServiceAccountKey(user, account.data.id, keyInput(data));
		if (!outcome.ok) {
			const failure = KEY_FOR_ACCOUNT_FAILURES[outcome.error];
			return fail(400, {
				action: 'create',
				message: failure.message(),
				id: null,
				field: failure.field
			});
		}
		return { action: 'create' as const, message: null, id: null, key: outcome.value.key };
	},

	revoke: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('revoke', m.api_keys_error_not_found());

		const outcome = await revokeApiKey(user, id.data.id);
		if (!outcome.ok) return rejected('revoke', m.api_keys_error_not_found(), id.data.id);
		return { action: 'revoke' as const, message: null, id: null };
	}
};
