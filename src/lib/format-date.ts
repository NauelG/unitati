import { getLocale } from '#lib/paraglide/runtime.js';

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
