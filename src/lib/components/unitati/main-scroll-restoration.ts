import type { NavigationType } from '$app/navigation';

/**
 * Minimal route-keyed scroll restoration for a scrolling region.
 *
 * SvelteKit's built-in scroll restoration only targets `window`. Once
 * `AppShell`'s `<main>` owns the vertical scroller instead of the document
 * (issue #96, ADR 0015 addendum), a browser Back to a route with a long list
 * must resume where the user left it; any other navigation — a link click, a
 * programmatic `goto`, a fresh load — starts the new route at the top. This
 * class holds the pure "what scrollTop should this navigation land on"
 * decision so it can be unit tested without a browser.
 */
export class MainScrollRestoration {
	private readonly positions = new Map<string, number>();

	/** Record where a route's scroller was before leaving it. */
	remember(pathname: string, scrollTop: number): void {
		this.positions.set(pathname, scrollTop);
	}

	/**
	 * The scrollTop to apply after navigating to `pathname`. Only a `popstate`
	 * navigation (browser Back/Forward) restores a remembered position; every
	 * other navigation type starts at the top, same as a fresh page load.
	 */
	resolve(pathname: string, type: NavigationType): number {
		if (type === 'popstate') {
			return this.positions.get(pathname) ?? 0;
		}
		return 0;
	}
}
