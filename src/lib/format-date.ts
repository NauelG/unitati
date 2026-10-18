import { getLocale } from '#lib/paraglide/runtime.js';
import { isHydrated } from '#lib/hydration.svelte.js';

/**
 * A calendar day (`YYYY-MM-DD`, how a due date is stored) as a reader expects it.
 *
 * Parsed as a local date on purpose: `new Date('2030-01-31')` is UTC midnight,
 * which west of Greenwich is still the 30th when formatted.
 */
export function formatDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(
		new Date(year, month - 1, date)
	);
}

/**
 * An instant as a reader expects it: medium date and short time in the active locale.
 *
 * Pass `timeZone` to pin it. Without one the viewer's zone is used, but only
 * once the app has hydrated: the server has its own zone and the browser the
 * viewer's, so formatting in "whatever this machine is" would make the server
 * HTML and the first client render disagree (a hydration mismatch, and the
 * wrong hour until the repaint). Until then both sides agree on UTC, and the
 * read of `isHydrated()` makes the caller's `$derived` repaint with the local
 * time right after.
 */
export function formatDateTime(date: Date, options: { timeZone?: string } = {}): string {
	const timeZone = options.timeZone ?? (isHydrated() ? undefined : 'UTC');
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone
	}).format(date);
}
