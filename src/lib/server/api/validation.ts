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
	/** Strings, not `Permission`s: this is a boundary, and validation is what narrows them. */
	scopes: readonly string[];
	/** `null` means the key never expires. */
	expiresInDays: number | null;
};

export const SERVICE_ACCOUNT_ROLES = ['technician', 'employee'] as const;
export type ServiceAccountRole = (typeof SERVICE_ACCOUNT_ROLES)[number];

export type InvalidServiceAccountInput = 'invalid_name' | 'role_not_allowed';

export function validateCreateServiceAccount(input: {
	name: string;
	role: string;
}): Outcome<{ name: string; role: ServiceAccountRole }, InvalidServiceAccountInput> {
	const parsedName = name.safeParse(input.name);
	if (!parsedName.success) return failure('invalid_name');
	// `admin` is deliberately absent: an unattended admin-equivalent credential is the worst possible leak.
	const role = SERVICE_ACCOUNT_ROLES.find((candidate) => candidate === input.role);
	if (!role) return failure('role_not_allowed');
	return success({ name: parsedName.data, role });
}

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
 * `holder` decides what is allowed: the scopes offered are those its role holds
 * (the creator's for a personal key, the service account's for its keys), and
 * "never" is for whoever can manage every key. Scopes narrow a role, so a scope
 * the holder does not hold would be a key that can never use it.
 */
export function validateCreateApiKey(
	holder: Pick<SessionUser, 'role'>,
	mayNeverExpire: boolean,
	input: CreateApiKeyInput
): Outcome<ValidApiKeyInput, InvalidApiKeyInput> {
	const parsedName = name.safeParse(input.name);
	if (!parsedName.success) return failure('invalid_name');

	const parsedScopes = z.array(permission).safeParse(input.scopes);
	if (!parsedScopes.success) return failure('scope_not_allowed');
	if (parsedScopes.data.length === 0) return failure('no_scopes');
	// `can` without the key's own scopes: this asks what the *role* may do.
	if (!parsedScopes.data.every((scope) => can({ role: holder.role }, scope))) {
		return failure('scope_not_allowed');
	}

	if (input.expiresInDays === null) {
		if (!mayNeverExpire) return failure('never_not_allowed');
	} else if (!(EXPIRY_DAYS as readonly number[]).includes(input.expiresInDays)) {
		return failure('invalid_expiry');
	}

	return success({
		name: parsedName.data,
		scopes: [...new Set(parsedScopes.data)],
		expiresInDays: input.expiresInDays
	});
}
