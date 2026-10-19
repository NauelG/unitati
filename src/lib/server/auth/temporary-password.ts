/** Without the look-alikes: no `0/O`, `1/l/I`. Someone reads this aloud or off a screen. */
export const TEMPORARY_PASSWORD_ALPHABET =
	'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const TEMPORARY_PASSWORD_LENGTH = 16;

/**
 * A cryptographically random password, shown once to the admin and never stored
 * or logged in plain text (#230). Bytes at or above the largest multiple of the
 * alphabet size are discarded, so every character is equally likely.
 */
export function generateTemporaryPassword(): string {
	const size = TEMPORARY_PASSWORD_ALPHABET.length;
	const limit = 256 - (256 % size);
	let password = '';

	while (password.length < TEMPORARY_PASSWORD_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
			if (byte >= limit) continue;
			password += TEMPORARY_PASSWORD_ALPHABET[byte % size];
			if (password.length === TEMPORARY_PASSWORD_LENGTH) break;
		}
	}
	return password;
}
