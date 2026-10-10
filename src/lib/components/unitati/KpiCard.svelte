<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	/**
	 * The `.ut-kpi` family (#84, built on #97's surfaces): a single count, read
	 * at a glance. White panel, 12px radius, large tabular-figure Instrument
	 * Sans — never Unbounded, which is a display face and the wrong weight for
	 * a number somebody scans sixty times a day.
	 *
	 * `tone` draws a left accent border and is the one semantic touch: absent
	 * for a plain count (`neutral`), present only when the number itself means
	 * something is waiting (`warning`) or wrong (`danger`). A KPI is not a
	 * status badge — most of the grid has no tone at all.
	 */
	export const kpiCard = tv({
		slots: {
			root: [
				'flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--border)]',
				'bg-[var(--surface-1)] p-[var(--space-4)]'
			],
			label: 'text-xs leading-4 font-medium text-[var(--ink-muted)]',
			value:
				'font-sans text-[28px] leading-[34px] font-semibold text-[var(--ink)] [font-variant-numeric:tabular-nums]',
			spark: 'mt-[var(--space-1)]'
		},
		variants: {
			tone: {
				neutral: { root: 'border-l-[var(--border)]' },
				warning: { root: 'border-l-4 border-l-[var(--warning)]' },
				danger: { root: 'border-l-4 border-l-[var(--danger)]' },
				success: { root: 'border-l-4 border-l-[var(--success)]' },
				brand: { root: 'border-l-4 border-l-[var(--brand)]' }
			}
		},
		defaultVariants: { tone: 'neutral' }
	});

	export type KpiTone = NonNullable<VariantProps<typeof kpiCard>['tone']>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Short, plain text: names what is being counted, not what the number means. */
		label: string;
		/**
		 * A finished number, not a raw count the component has to format: the
		 * caller already knows the locale (es-ES throughout v1) and whether a
		 * unit or a separator belongs after it.
		 */
		value: number | string;
		/** Draws a left accent border; absent for a plain count. */
		tone?: KpiTone;
		/** Phase #90's sparkline. Nothing renders here today. */
		sparkline?: Snippet;
		class?: string;
	}

	let { label, value, tone = 'neutral', sparkline, class: className }: Props = $props();

	const styles = $derived(kpiCard({ tone }));
</script>

<!--
	A `<dl>` of one pair rather than two generic `div`s: a screen reader already
	knows "term, definition" without an extra `aria-label` repeating the same
	two strings back as a third one.
-->
<dl class={styles.root({ class: className })}>
	<dt class={styles.label()}>{label}</dt>
	<dd class={styles.value()}>{value}</dd>
	{#if sparkline}
		<div class={styles.spark()}>{@render sparkline()}</div>
	{/if}
</dl>
