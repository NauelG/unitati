import type { LocationEntry } from '../directory';
import { matchKey } from './mapping';

/** What a location cell resolves to against the catalogue (#21). */
export type LocationResolution =
	| { kind: 'none' }
	| { kind: 'match'; location: LocationEntry }
	| { kind: 'ambiguous' }
	/** Create `names` as a chain, the first under `parent` (null: as a root). */
	| { kind: 'create'; parent: LocationEntry | null; names: string[] };

const SEPARATOR = ' › ';

const segmentsOf = (path: string) => path.split(SEPARATOR);

/**
 * In order: an exact code (case-blind); an exact path, written with ` › ` or
 * `/`; a single name that only one location carries. A name that several carry
 * is ambiguous, and nothing else is guessed: no match creates the missing tail
 * of the chain under the deepest ancestor that exists.
 */
export function planLocation(
	value: string,
	catalogue: readonly LocationEntry[]
): LocationResolution {
	const trimmed = value.trim();
	if (trimmed === '') return { kind: 'none' };

	const lowered = trimmed.toLowerCase();
	const byCode = catalogue.find((location) => location.code?.toLowerCase() === lowered);
	if (byCode) return { kind: 'match', location: byCode };

	const names = trimmed
		.split(/\s*›\s*|\s*\/\s*/)
		.map((segment) => segment.trim())
		.filter((segment) => segment !== '');
	if (names.length === 0) return { kind: 'none' };
	const keys = names.map(matchKey);

	const byPath = catalogue.find((location) => {
		const own = segmentsOf(location.path).map(matchKey);
		return own.length === keys.length && own.every((key, i) => key === keys[i]);
	});
	if (byPath) return { kind: 'match', location: byPath };

	if (names.length === 1) {
		const sameName = catalogue.filter((location) => matchKey(location.name) === keys[0]);
		if (sameName.length === 1) return { kind: 'match', location: sameName[0] };
		if (sameName.length > 1) return { kind: 'ambiguous' };
	}

	// The deepest existing ancestor: the longest proper prefix that is a path.
	for (let length = names.length - 1; length >= 1; length--) {
		const prefix = keys.slice(0, length);
		const ancestor = catalogue.find((location) => {
			const own = segmentsOf(location.path).map(matchKey);
			return own.length === length && own.every((key, i) => key === prefix[i]);
		});
		if (ancestor) return { kind: 'create', parent: ancestor, names: names.slice(length) };
	}
	return { kind: 'create', parent: null, names };
}

/**
 * The catalogue as it will be once `resolution` is applied, so later rows that
 * name the same new path find it instead of creating it twice. The new entries
 * carry synthetic ids (`new:<path>`).
 */
export function withPlanned(
	catalogue: LocationEntry[],
	resolution: Extract<LocationResolution, { kind: 'create' }>
): LocationEntry[] {
	const added: LocationEntry[] = [];
	let parent = resolution.parent;
	for (const name of resolution.names) {
		const path = parent ? `${parent.path}${SEPARATOR}${name}` : name;
		const entry: LocationEntry = {
			id: `new:${path}`,
			name,
			parentId: parent?.id ?? null,
			path,
			depth: parent ? parent.depth + 1 : 0,
			code: null,
			address: null,
			notes: null,
			latitude: null,
			longitude: null
		};
		added.push(entry);
		catalogue.push(entry);
		parent = entry;
	}
	return added;
}
