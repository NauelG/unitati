/** A run of text, and whether the viewer's query matched it. */
export interface HighlightPart {
	text: string;
	match: boolean;
}

const MARKS = /\p{M}/gu;

/** Lowercase, accents stripped: what the server's `unaccent` makes of a word. */
function fold(character: string): string {
	return character.normalize('NFD').replace(MARKS, '').toLowerCase();
}

/**
 * Splits `text` into the runs a search box should emphasise (#12). Matching is
 * on word starts, ignoring case and accents, like the query that found the row.
 *
 * A word that was found by its stem ("impresoras" finds "impresora") would not
 * occur verbatim, so each typed word falls back to its longest prefix of at least
 * three characters that does. It is a visual aid, not the match: the server
 * decided what matched, this only shows where.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
	const characters = [...text];
	const folded = characters.map(fold);
	const wordStart = characters.map(
		(_, index) => index === 0 || !/[\p{L}\p{N}]/u.test(characters[index - 1])
	);
	const marked = characters.map(() => false);

	const words = (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => [...word].map(fold).join(''));

	for (const word of words) {
		for (let length = word.length; length >= Math.min(3, word.length); length--) {
			const needle = word.slice(0, length);
			let found = false;

			for (let start = 0; start < characters.length; start++) {
				if (!wordStart[start]) continue;

				let cursor = start;
				let matched = 0;
				while (cursor < characters.length && matched < needle.length) {
					if (folded[cursor] !== needle.slice(matched, matched + folded[cursor].length)) break;
					matched += folded[cursor].length;
					cursor++;
				}

				if (matched === needle.length) {
					for (let index = start; index < cursor; index++) marked[index] = true;
					found = true;
				}
			}

			if (found) break;
		}
	}

	const parts: HighlightPart[] = [];
	characters.forEach((character, index) => {
		const last = parts.at(-1);
		if (last && last.match === marked[index]) last.text += character;
		else parts.push({ text: character, match: marked[index] });
	});
	return parts;
}
