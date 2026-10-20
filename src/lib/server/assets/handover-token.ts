import { createHash, randomBytes } from 'node:crypto';

/**
 * The single-use signing token of a handover (ADR 0035, decision 4): 32 bytes
 * from a CSPRNG, base64url-encoded. 256 random bits need no slow hash, so only
 * the plain sha256 is stored and a link is looked up by it, the same treatment
 * an API key gets (ADR 0022). The token itself is shown once and never logged.
 */

export function generateHandoverToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashHandoverToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
