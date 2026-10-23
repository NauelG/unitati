import type { PageOption } from './page-link-extension.js';

/**
 * Asks a page picker endpoint (#324, `GET /knowledge/pages/pick`) which pages
 * the editor may offer. The server decides what the viewer can read; a failed
 * request offers none rather than breaking the typing.
 */
export async function fetchPages(
	url: string,
	query: string,
	extra: Record<string, string> = {}
): Promise<PageOption[]> {
	try {
		const response = await fetch(`${url}?${new URLSearchParams({ ...extra, q: query })}`, {
			headers: { accept: 'application/json' }
		});
		if (!response.ok) return [];
		return (await response.json()) as PageOption[];
	} catch {
		return [];
	}
}
