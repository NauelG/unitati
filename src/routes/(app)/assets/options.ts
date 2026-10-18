import type { SelectOption } from '#lib/components/unitati/SelectField.svelte';
import { statusLabel } from '#lib/components/unitati/status.js';
import { ASSET_STATES } from '#lib/domain/status.js';

/** `{ id, … }` rows as `<select>` options, labelled however the caller likes. */
export function options<T extends { id: string }>(
	entries: readonly T[],
	label: (entry: T) => string
): SelectOption[] {
	return entries.map((entry) => ({ value: entry.id, label: label(entry) }));
}

/**
 * A function, not a constant: the labels are paraglide messages, and calling
 * them at module scope would freeze the locale at import time.
 */
export function stateOptions(): SelectOption[] {
	return ASSET_STATES.map((key) => ({ value: key, label: statusLabel(key) }));
}

/**
 * A location select: labelled by path (`Barcelona office › Floor 1`), with the
 * code as a suffix when there is one. The name alone is ambiguous — every
 * building has a "Floor 1" (ADR 0027).
 */
export function locationOptions(
	entries: readonly { id: string; path: string; code: string | null }[]
): SelectOption[] {
	return options(entries, (entry) => (entry.code ? `${entry.path} (${entry.code})` : entry.path));
}
