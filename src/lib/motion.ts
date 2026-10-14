/**
 * Motion system support code (#87): the pieces that are plain TypeScript, not
 * markup, so they are testable without a browser.
 *
 * The three durations below mirror `src/app.css`'s `--motion-fast` /
 * `--motion-base` / `--motion-slow`. `animate:flip` (Svelte's FLIP animation,
 * `DataTable`'s list physics) takes a number of milliseconds, not a CSS custom
 * property — there is no way to hand it `var(--motion-base)` — so this is the
 * one place a motion duration is duplicated as a JS literal instead of read
 * from the token. If the CSS token changes, change this too.
 */
export const MOTION_FAST_MS = 120;
export const MOTION_BASE_MS = 160;
export const MOTION_SLOW_MS = 240;

/**
 * `--ease-out` as a JS literal, for the same reason the durations above are
 * ones: the Web Animations API takes an easing *string*, not a custom
 * property. Read by `NumberFlow` (#90), whose animations run through
 * `Element.animate()` inside a shadow root and so cannot inherit a token.
 */
export const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * The timing `NumberFlow` is handed wherever it is used (#90).
 *
 * The library's own defaults are a 900ms transform and a 450ms opacity fade —
 * three to four times the motion constitution's ceiling, which is
 * `--motion-slow` and "nothing above it, ever" (#87). They have to be passed
 * explicitly on every instance; there is no global configuration hook.
 *
 * `spinTiming` is deliberately absent: the library falls back to
 * `transformTiming` for the digit spin when it is unset, so naming it would
 * add a third copy of the same number.
 */
export const NUMBER_FLOW_TIMING = {
	transformTiming: { duration: MOTION_SLOW_MS, easing: EASE_OUT },
	opacityTiming: { duration: MOTION_FAST_MS, easing: EASE_OUT }
} as const;

/**
 * Reads the one global reduced-motion signal. Used only where CSS cannot
 * reach — `document.startViewTransition` is a JS call, not a style, so the
 * `prefers-reduced-motion` media layer in `app.css` cannot stop it on its own
 * (constitution rule 5 is a CSS layer; this is the one call it cannot cover).
 * Everything else — FLIP, enter/exit classes, the badge pulse — is already
 * neutralised by that CSS layer and has no business re-checking this in JS.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A record's `view-transition-name` (S1, the record morph): `prefix-{slug}`,
 * where `slug` is the record's own key (an asset tag, a ticket tag, …) folded
 * into a legal CSS `<custom-ident>` — lowercase letters, digits and hyphens
 * only, never starting or ending with one. `view-transition-name` rejects
 * anything else outright, and a tag such as "AST 0231" or one starting with a
 * digit would otherwise produce an invalid name silently dropped by the
 * browser instead of failing loudly.
 */
export function toViewTransitionName(prefix: string, key: string): string {
	const slug = key
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${prefix}-${slug.length > 0 ? slug : 'x'}`;
}

/**
 * Whichever `document.startViewTransition(...).finished` promise is currently
 * in flight, set by the root `+layout.svelte`'s `onNavigate`. `null` once it
 * settles, or whenever a navigation never started a transition at all
 * (reduced motion, Firefox, SSR).
 */
let pendingViewTransition: Promise<unknown> | null = null;

/**
 * Called once, right after `document.startViewTransition` starts: lets
 * anything elsewhere that restores state after a navigation (currently
 * `AppShell`'s `<main>` scroll restoration) wait for the animation to finish
 * instead of racing it. The issue is explicit about the ordering: a restored
 * scroll position must land "after the transition completes, without
 * animating the scroll position itself" — written here before the content
 * morphs, it would otherwise bake a mid-scroll frame into the "new" snapshot
 * the browser captures for the crossfade.
 */
export function registerViewTransitionSettle(finished: Promise<unknown>): void {
	pendingViewTransition = finished;
	// `.catch` here, not just `.finally`: a rejected `finished` (the browser
	// skipped or aborted the transition) is expected and already handled by
	// `afterViewTransitionSettles`'s own try/catch — without this, Node still
	// reports it as an unhandled rejection the moment this callback's `.then`
	// chain is the only thing holding it.
	finished
		.catch(() => {})
		.finally(() => {
			if (pendingViewTransition === finished) pendingViewTransition = null;
		});
}

/**
 * Runs `fn` once any in-flight view transition has finished animating — or
 * immediately if none is active. A transition that the browser skipped or
 * aborted still counts as "settled": `fn` must still run, there is simply no
 * animation left to wait out.
 */
export async function afterViewTransitionSettles(fn: () => void): Promise<void> {
	if (pendingViewTransition) {
		try {
			await pendingViewTransition;
		} catch {
			// Skipped/aborted: still settled, from this function's point of view.
		}
	}
	fn();
}
