/**
 * Lets a translated sentence carry a number that rolls (S2, #91).
 *
 * The sentence is a Paraglide message — `"{count} sin asignar"`, with its own
 * singular/plural choice — so the number cannot be pulled out of the markup.
 * Instead the page renders the message with `countToken(i)` where the number
 * goes, and `splitRolling` cuts the result into text and numbers for
 * `RollingText` to draw, the numbers in a `NumberFlow`.
 */

const OPEN = '⟦';
const CLOSE = '⟧';

/** What to pass as a message's `count` argument so the number can be found again. */
export function countToken(index: number): string {
	return `${OPEN}${index}${CLOSE}`;
}

export function splitRolling(text: string, counts: readonly number[]): (string | number)[] {
	const parts: (string | number)[] = [];
	let buffer = '';
	let rest = text;

	while (rest.length > 0) {
		const open = rest.indexOf(OPEN);
		const close = open === -1 ? -1 : rest.indexOf(CLOSE, open);
		if (open === -1 || close === -1) {
			buffer += rest;
			break;
		}

		const index = Number(rest.slice(open + 1, close));
		const count = Number.isInteger(index) ? counts[index] : undefined;
		if (count === undefined) {
			// Not ours to replace: keep it as text so the mistake is visible.
			buffer += rest.slice(0, close + 1);
		} else {
			buffer += rest.slice(0, open);
			if (buffer) parts.push(buffer);
			parts.push(count);
			buffer = '';
		}
		rest = rest.slice(close + 1);
	}

	if (buffer) parts.push(buffer);
	return parts;
}

/**
 * The right wording for `count` with its number replaced by a token. A
 * singular message hardcodes its "1" ("1 activo"), so the "1" is swapped for the
 * token: the number stays in the same place in the sentence when the count goes
 * from 1 to 3, and so keeps rolling instead of being replaced along with the
 * rest of the text.
 */
export function rollingPlural(
	count: number,
	one: () => string,
	other: (input: { count: string }) => string,
	index: number
): string {
	return count === 1 ? one().replace('1', countToken(index)) : other({ count: countToken(index) });
}
