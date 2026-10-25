/**
 * Time tracking's pure rules (ADR 0051): how a duration is typed, shown and
 * rounded. Shared by the server (which stores whole minutes) and the forms
 * (which accept `1h 30m`), so the two cannot read the same text differently.
 */

/**
 * An overflow guard on the `integer` column, not a product limit: about 1,900
 * years of minutes are refused long before Postgres would. A forgotten timer is
 * corrected in the form, not capped (ADR 0051).
 */
export const MAX_ENTRY_MINUTES = 1_000_000;

/** `1h`, `45m`, `1h 30m`, `1h30m`: whole hours and/or whole minutes. */
const HOURS_AND_MINUTES = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/;
/** `1.5h`, `1,5h`, `.5h`: decimal hours on their own. */
const DECIMAL_HOURS = /^(\d*[.,]\d+)\s*h$/;

/**
 * The minutes a person typed, or `null` when the text is not one of the accepted
 * forms. Whole minutes, at least 1: `0m` and `0.001h` are refused rather than
 * stored as nothing.
 */
export function parseDuration(input: string): number | null {
	const text = input.trim().toLowerCase();
	if (text === '') return null;

	const decimal = DECIMAL_HOURS.exec(text);
	if (decimal) return checked(Math.round(Number(decimal[1].replace(',', '.')) * 60));

	const match = HOURS_AND_MINUTES.exec(text);
	if (!match || (match[1] === undefined && match[2] === undefined)) return null;

	return checked(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0));
}

function checked(minutes: number): number | null {
	return Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= MAX_ENTRY_MINUTES
		? minutes
		: null;
}

/** `90` → `1h 30m`, `45` → `45m`, `120` → `2h`: the form `parseDuration` reads back. */
export function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}m`;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Hours with two decimals, the way the CSV export and the totals carry them: `90` → `1.50`. */
export function decimalHours(minutes: number): string {
	return (minutes / 60).toFixed(2);
}

/** Elapsed time on the app shell's timer, `HH:MM`: `42 min` → `00:42`. */
export function formatElapsed(elapsedMs: number): string {
	const total = Math.max(0, Math.floor(elapsedMs / 60_000));
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** What stopping a timer prefills: the elapsed time to the nearest minute, never below 1. */
export function suggestedMinutes(startedAt: Date, now: Date): number {
	const elapsed = Math.round((now.getTime() - startedAt.getTime()) / 60_000);
	return Math.min(Math.max(elapsed, 1), MAX_ENTRY_MINUTES);
}

/** The calendar day (`YYYY-MM-DD`) an instant falls on in `timeZone`. */
export function calendarDayIn(timeZone: string, at: Date): string {
	// `en-CA` formats as ISO `YYYY-MM-DD`.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}
