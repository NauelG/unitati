import { CalendarDate } from '@internationalized/date';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` to a `CalendarDate`; anything empty or not a real calendar day is `undefined`. */
export function parseIsoDate(value: string | null | undefined): CalendarDate | undefined {
	const match = value ? ISO_DATE.exec(value) : null;
	if (!match) return undefined;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new CalendarDate(year, month, day);
	// `CalendarDate` constrains out-of-range parts (Feb 30 becomes Feb 28); reject instead.
	return date.year === year && date.month === month && date.day === day ? date : undefined;
}

/** A `CalendarDate` to `YYYY-MM-DD`; no date is the empty string the forms post for "cleared". */
export function toIsoDate(date: { year: number; month: number; day: number } | null | undefined) {
	if (!date) return '';
	const pad = (n: number, width: number) => String(n).padStart(width, '0');
	return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}
