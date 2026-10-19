/**
 * The shared look and rules of in-place editing (ADR 0029). Kept as strings and
 * a helper, not a component, so the chip, the row and the heading text all draw
 * the same outline without nesting a wrapper inside each other.
 */

/** 1px `--border` at rest, `--border-strong` on hover and focus. Only for an editable value. */
export const EDITABLE_OUTLINE = [
	'group cursor-pointer border border-[var(--border)] rounded-[var(--radius-md)]',
	'hover:border-[var(--border-strong)] focus-visible:border-[var(--border-strong)]',
	'data-[state=open]:border-[var(--border-strong)]',
	'outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring,var(--brand))] focus-visible:ring-offset-1'
].join(' ');

/** The chevron: present at rest (so nothing shifts), revealed on hover, focus and while open. */
export const EDITABLE_CHEVRON =
	'size-3 shrink-0 opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70 group-data-[state=open]:opacity-70';

/** Popover width: the anchor's, never narrower than a readable list, and inside the viewport. */
export const EDITABLE_POPOVER =
	'min-w-56 w-(--bits-popover-anchor-width) max-w-[calc(100vw-2rem)] max-sm:w-[calc(100vw-2rem)] p-0';

/** Options above this count get a type-to-filter input. */
export const FILTER_THRESHOLD = 7;

/** `#action-status` and `action-status` both name the same fragment. */
export function hashMatches(openOnHash: string | undefined, hash: string): boolean {
	if (!openOnHash) return false;
	const wanted = openOnHash.startsWith('#') ? openOnHash : `#${openOnHash}`;
	return hash === wanted;
}
