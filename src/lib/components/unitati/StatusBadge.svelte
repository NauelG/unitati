<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-badge` family. Full-pill geometry (ADR 0019): a status marker is
	 * the one shape in the radius grammar that stays a pill, visibly distinct
	 * from the 8px buttons/inputs/selects and the 12px panels around it. The
	 * dot is a `::before` pseudo-element inheriting `currentColor`, exactly as
	 * the design system draws it, so the tone sets one colour and the dot
	 * follows.
	 */
	export const badge = tv({
		base: [
			'inline-flex items-center gap-[var(--space-1)] h-[22px] px-[var(--space-2)]',
			'rounded-[var(--radius-full)] text-xs leading-4 font-semibold tracking-[0.04em] whitespace-nowrap',
			"before:content-[''] before:size-1.5 before:rounded-[var(--radius-full)] before:bg-current"
		],
		variants: {
			tone: {
				brand: 'bg-[var(--brand-soft)] text-[var(--brand)]',
				desk: 'bg-[var(--desk-soft)] text-[var(--desk)]',
				success: 'bg-[var(--success-soft)] text-[var(--success)]',
				warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
				danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
				neutral: 'bg-[var(--surface-2)] text-[var(--ink-muted)]'
			},
			/** `ut-badge-plain`: no dot, for a label that names a kind of thing rather than a state. */
			plain: { true: 'before:hidden' }
		}
		// No `defaultVariants`: the tone is always derived from the status, so a
		// default would be a value nothing can reach.
	});
</script>

<script lang="ts">
	import { statusBadge, type StatusKey } from './status.js';

	interface Props {
		/**
		 * A status key, never display text. The union is the point: `"En curso"`
		 * fails `npm run check` instead of rendering an untranslated badge.
		 */
		status: StatusKey;
		class?: string;
	}

	let { status, class: className }: Props = $props();

	const resolved = $derived(statusBadge(status));
</script>

{#if resolved}
	<span class={badge({ tone: resolved.tone, class: className })}>{resolved.label}</span>
{/if}
