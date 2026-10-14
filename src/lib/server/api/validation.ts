import { z } from 'zod';
import { can, PERMISSIONS, type Permission } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';

/**
 * Input rules for creating a key. They are returned as typed codes rather than
 * thrown, because each one maps to a field error on the form.
 */

export const EXPIRY_DAYS = [30, 90, 365] as const;
export const DEFAULT_EXPIRY_DAYS = 90;

export const MAX_NAME_LENGTH = 80;

export type CreateApiKeyInput = {
	name: string;
	scopes: readonly Permission[];
	/** `null` means the key never expires. */
	expiresInDays: number | null;
};

export type InvalidApiKeyInput =
	'invalid_name' | 'no_scopes' | 'scope_not_allowed' | 'invalid_expiry' | 'never_not_allowed';

export type ValidApiKeyInput = {
	name: string;
	scopes: Permission[];
	expiresInDays: number | null;
};

const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const permission = z.enum(PERMISSIONS);

/**
 * `actor` decides what is allowed: the scopes offered are those its role holds,
 * and "never" is for whoever can manage every key. Scopes narrow a role, so a
 * scope the creator does not hold would be a key that can never use it.
 */
export function validateCreateApiKey(
	actor: SessionUser,
	input: CreateApiKeyInput
): Outcome<ValidApiKeyInput, InvalidApiKeyInput> {
	const parsedName = name.safeParse(input.name);
	if (!parsedName.success) return failure('invalid_name');

	const parsedScopes = z.array(permission).safeParse(input.scopes);
	if (!parsedScopes.success) return failure('scope_not_allowed');
	if (parsedScopes.data.length === 0) return failure('no_scopes');
	// `can` without the key's own scopes: this asks what the *person* may do.
	const holds = { role: actor.role };
	if (!parsedScopes.data.every((scope) => can(holds, scope))) return failure('scope_not_allowed');

	if (input.expiresInDays === null) {
		if (!can(actor, 'api.keys.manage.all')) return failure('never_not_allowed');
	} else if (!(EXPIRY_DAYS as readonly number[]).includes(input.expiresInDays)) {
		return failure('invalid_expiry');
	}

	return success({
		name: parsedName.data,
		scopes: [...new Set(parsedScopes.data)],
		expiresInDays: input.expiresInDays
	});
}
