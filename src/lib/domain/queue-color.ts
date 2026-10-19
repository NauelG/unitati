/**
 * The colours a queue can wear. A fixed palette, not free hex: every key has a
 * light and a dark value in `app.css` (`--queue-<key>`), so a dot stays legible
 * on both canvases and no admin can pick a colour that vanishes on one of them.
 *
 * The key is what is stored; the CSS variable is derived from it.
 */
export const QUEUE_COLORS = [
	'gray',
	'blue',
	'violet',
	'pink',
	'red',
	'amber',
	'green',
	'teal'
] as const;

export type QueueColor = (typeof QUEUE_COLORS)[number];

export const DEFAULT_QUEUE_COLOR: QueueColor = 'gray';

export function isQueueColor(value: unknown): value is QueueColor {
	return typeof value === 'string' && (QUEUE_COLORS as readonly string[]).includes(value);
}

/** The CSS custom property that holds the colour. Unknown keys fall back to the default. */
export function queueColorVar(color: string): string {
	return `var(--queue-${isQueueColor(color) ? color : DEFAULT_QUEUE_COLOR})`;
}
