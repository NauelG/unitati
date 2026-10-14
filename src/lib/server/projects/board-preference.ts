import {
	parseBoardPreference,
	type BoardPreference,
	type StatePreference
} from '#lib/board-preference.js';

/**
 * The server's only reader of the `unitati-board` cookie (#127). The cookie is
 * client-written, so nothing in it is trusted: it is parsed defensively and
 * checked against the organisation's catalogue of states.
 */
export function readBoardPreference(
	raw: string | null | undefined,
	catalogue: readonly string[]
): BoardPreference {
	const parsed = parseBoardPreference(raw);
	const known = new Set(catalogue);

	// A deleted state is dropped; the cap keeps a forged cookie from growing the response.
	const states: Record<string, StatePreference> = {};
	for (const [stateId, value] of Object.entries(parsed.states)) {
		if (!known.has(stateId) || Object.keys(states).length >= known.size) continue;
		states[stateId] = value;
	}

	return { view: parsed.view, states };
}
