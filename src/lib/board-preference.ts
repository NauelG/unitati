import { z } from 'zod';

/**
 * The board preference (#127): which columns a person folded by hand and
 * whether they last chose the board or the list. It lives in a cookie, not in
 * `localStorage`, because the server decides the view on first paint (see
 * `src/app.html` for why the other UI preferences can do without).
 *
 * This file is the shape both sides agree on and the one writer. The server
 * reads it through `#lib/server/projects/board-preference.js`, which also
 * checks it against the organisation's states.
 */

export const BOARD_COOKIE = 'unitati-board';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type BoardView = 'board' | 'list';
export type StatePreference = 'collapsed' | 'expanded';
export type BoardPreference = {
	/** `null`: no stored choice, so the default board. */
	view: BoardView | null;
	states: Record<string, StatePreference>;
};

export const EMPTY_BOARD_PREFERENCE: BoardPreference = { view: null, states: {} };

export const boardPreferenceSchema = z.object({
	view: z.enum(['board', 'list']).nullable(),
	states: z.record(z.string(), z.enum(['collapsed', 'expanded']))
});

/** Whatever the cookie holds; anything unreadable is "no preference", never an error. */
export function parseBoardPreference(raw: string | null | undefined): BoardPreference {
	if (!raw) return { ...EMPTY_BOARD_PREFERENCE, states: {} };
	try {
		const parsed = boardPreferenceSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return parsed.data;
	} catch {
		// Not JSON: fall through to the empty preference.
	}
	return { ...EMPTY_BOARD_PREFERENCE, states: {} };
}

export const serializeBoardPreference = (preference: BoardPreference): string =>
	JSON.stringify(preference);

/** An explicit `?view=` always wins; then the stored choice; then the board. */
export function resolveView(param: string | null, stored: BoardView | null): BoardView {
	if (param === 'board' || param === 'list') return param;
	return stored ?? 'board';
}

/** The cookie as the browser holds it, or `undefined` outside one. */
function readDocumentCookie(): string | undefined {
	if (typeof document === 'undefined') return undefined;
	const prefix = `${BOARD_COOKIE}=`;
	const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix));
	if (entry === undefined) return undefined;
	try {
		return decodeURIComponent(entry.slice(prefix.length));
	} catch {
		return undefined;
	}
}

/** The stored preference in this browser. */
export const readStoredBoardPreference = (): BoardPreference =>
	parseBoardPreference(readDocumentCookie());

/**
 * The one client-side writer. Merges over what is stored, so changing the view
 * keeps the folded columns and the other way round. Not `HttpOnly`: the client
 * writes it. It holds state ids and a view name, nothing secret.
 */
export function storeBoardPreference(patch: Partial<BoardPreference>): BoardPreference {
	const next = { ...readStoredBoardPreference(), ...patch };
	if (typeof document !== 'undefined') {
		document.cookie =
			`${BOARD_COOKIE}=${encodeURIComponent(serializeBoardPreference(next))}` +
			`; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
	}
	return next;
}

export { ONE_YEAR_SECONDS as BOARD_COOKIE_MAX_AGE };
