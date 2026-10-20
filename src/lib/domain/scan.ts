/**
 * The scan contract (ADR 0038): a printed label encodes `{origin}/s/{code}`.
 * Pure and database-free so the client (global search) and the server (the
 * route, the label printer) share one definition.
 */

export const SCAN_PREFIX = '/s/';

export function scanPath(code: string): string {
	return `${SCAN_PREFIX}${encodeURIComponent(code)}`;
}

export function scanUrl(origin: string, code: string): string {
	return new URL(scanPath(code), origin).href;
}

/**
 * The code in a scanned URL, or null when the input is not one. Any host is
 * accepted: the URL is only read to extract the code, never navigated to.
 */
export function codeFromScan(input: string): string | null {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!url.pathname.startsWith(SCAN_PREFIX)) return null;

	const segments = url.pathname.slice(SCAN_PREFIX.length).split('/');
	if (segments.length === 2 && segments[1] === '') segments.pop();
	if (segments.length !== 1 || segments[0] === '') return null;

	try {
		return decodeURIComponent(segments[0]);
	} catch {
		return null;
	}
}
