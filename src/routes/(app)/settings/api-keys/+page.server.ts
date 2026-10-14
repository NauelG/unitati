import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { SCOPE_GROUPS } from '#lib/settings/api-scopes.js';
import { DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS } from '#lib/server/api/index.js';
import { createApiKey, listApiKeys, revokeApiKey } from '#lib/server/api/index.js';
import type { CreateApiKeyFailure } from '#lib/server/api/index.js';
import { can, permissionsFor } from '#lib/server/access/permissions.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, rejected, withId } from '../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/api-keys';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const held = new Set(permissionsFor(user.role));

	return {
		keys: (await listApiKeys(user)).map((key) => ({
			id: key.id,
			name: key.name,
			start: key.start,
			scopes: key.scopes,
			ownerName: key.ownerName,
			createdAt: key.createdAt,
			lastUsedAt: key.lastUsedAt,
			expiresAt: key.expiresAt
		})),
		canManageAll: can(user, 'api.keys.manage.all'),
		/** What the creator's role holds, in checklist order: never a scope that role could not use. */
		grantable: SCOPE_GROUPS.flatMap((group) => group.permissions).filter((p) => held.has(p)),
		expiryDays: [...EXPIRY_DAYS],
		defaultExpiryDays: DEFAULT_EXPIRY_DAYS
	};
};

type Field = 'name' | 'scopes' | 'expiresInDays';

const FAILURES: Record<CreateApiKeyFailure, { field: Field; message: () => string }> = {
	invalid_name: { field: 'name', message: m.api_keys_error_name },
	duplicate_name: { field: 'name', message: m.api_keys_error_duplicate },
	no_scopes: { field: 'scopes', message: m.api_keys_error_no_scopes },
	scope_not_allowed: { field: 'scopes', message: m.api_keys_error_scope },
	invalid_expiry: { field: 'expiresInDays', message: m.api_keys_error_expiry },
	never_not_allowed: { field: 'expiresInDays', message: m.api_keys_error_never }
};

/** `"never"` is the one non-numeric expiry; anything else that is not a number fails validation. */
function expiryOf(raw: FormDataEntryValue | null): number | null {
	if (raw === 'never') return null;
	return typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const data = await request.formData();

		const outcome = await createApiKey(user, {
			name: String(data.get('name') ?? ''),
			// Unknown strings are refused by the domain's own validation.
			scopes: data.getAll('scopes').filter((value) => typeof value === 'string') as never,
			expiresInDays: expiryOf(data.get('expiresInDays'))
		});

		if (!outcome.ok) {
			const { field, message } = FAILURES[outcome.error];
			return fail(400, { action: 'create', message: message(), id: null, field });
		}

		// The plaintext travels in this one response and is never stored: the page
		// reads it and drops it when the dialog closes.
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
