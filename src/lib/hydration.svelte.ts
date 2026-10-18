/**
 * Whether the app has hydrated in the browser.
 *
 * Anything that depends on the *viewer's* environment (their time zone) cannot
 * be rendered the same on the server and in the first client render, and a
 * difference between the two is a hydration mismatch. Such a value renders a
 * neutral stand-in until this flips, then repaints with the real one.
 *
 * Module state is safe on the server: nothing ever calls `markHydrated` there,
 * so every request sees `false`.
 */
let hydrated = $state(false);

export function isHydrated(): boolean {
	return hydrated;
}

/** Called once, from the root layout's `onMount`. */
export function markHydrated(): void {
	hydrated = true;
}
