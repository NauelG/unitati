import { createHash, randomBytes } from 'node:crypto';

/**
 * The shape of an API key (ADR 0022): a fixed prefix, then 32 bytes from a
 * CSPRNG, base64url-encoded. 256 random bits need no slow hash, so a key is
 * stored as the plain SHA-256 of the whole string and looked up by it.
 */

export const KEY_PREFIX = 'unt_';

/** 32 bytes in base64url, without padding. */
const SECRET_LENGTH = 43;

/** How much of the secret is kept in clear so a person can tell their keys apart. */
export const START_LENGTH = 8;

const FORMAT = new RegExp(`^${KEY_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

export function generateKey(): string {
	return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isWellFormed(raw: string): boolean {
	return FORMAT.test(raw);
}

export function hashKey(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

export function startOf(raw: string): string {
	return raw.slice(KEY_PREFIX.length, KEY_PREFIX.length + START_LENGTH);
}
