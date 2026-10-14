/**
 * Where the catalogues lived before they moved under `/settings` (#126).
 *
 * The one table of old roots. Bookmarks, emails and tickets outlive any
 * deprecation window, so these stay: `hooks.server.ts` answers each with a
 * 308 (method and body preserved) to the new root, keeping sub-path and query.
 */
const MOVED_ROOTS: Readonly<Record<string, string>> = {
	'/assets/categories': '/settings/assets/categories',
	'/assets/manufacturers': '/settings/assets/manufacturers',
	'/assets/models': '/settings/assets/models',
	'/service-desk/queues': '/settings/service-desk/queues'
};

/** The new location for a legacy catalogue URL, or `null` when the URL is not one. */
export function legacyCatalogueRedirect(url: URL): string | null {
	for (const [from, to] of Object.entries(MOVED_ROOTS)) {
		if (url.pathname === from || url.pathname.startsWith(`${from}/`)) {
			return `${to}${url.pathname.slice(from.length)}${url.search}`;
		}
	}
	return null;
}
