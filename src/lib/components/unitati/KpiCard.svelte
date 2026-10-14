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
	 *
	 * `actionable` is the depth language (#90). A card that navigates rests on
	 * `--shadow-sm` and lifts to `--shadow-md` on hover; a card that does not
	 * navigate has no shadow and never moves. The rule is the point: the lift
	 * is a promise that clicking does something, so a static card borrowing it
	 * would be lying. `tokens.json` says as much of `--shadow-sm` — "optional;
	 * the border is the primary edge" — so the resting shadow is what marks the
	 * card as raised *at all*, and its absence is meaningful.
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
			},
			actionable: {
				true: {
					root: [
						'shadow-[var(--shadow-sm)] transition-[box-shadow,transform] ut-transition-fast',
						'hover:-translate-y-px hover:shadow-[var(--shadow-md)]',
						// The press cancels the lift: a card that stayed raised while
						// being clicked would read as stuck rather than pressed. Mirrors
						// `Button`'s own `active:translate-y-px`.
						'active:translate-y-0 active:shadow-[var(--shadow-sm)]',
						'no-underline'
					]
				}
			}
		},
		defaultVariants: { tone: 'neutral', actionable: false }
	});

	export type KpiTone = NonNullable<VariantProps<typeof kpiCard>['tone']>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import NumberFlow from '@number-flow/svelte';
	import { NUMBER_FLOW_TIMING } from '#lib/motion.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	interface Props {
		/** Short, plain text: names what is being counted, not what the number means. */
		label: string;
		/**
		 * A finished number, not a raw count the component has to format: the
		 * caller already knows the locale (es-ES throughout v1) and whether a
		 * unit or a separator belongs after it.
		 *
		 * A `number` additionally animates between values (#90); a `string` is
		 * printed as given, since there is no way to interpolate "3 de 7".
		 */
		value: number | string;
		/** Draws a left accent border; absent for a plain count. */
		tone?: KpiTone;
		/**
		 * Where the card goes. Present makes the whole card one link and turns
		 * on the hover lift; absent leaves it a static, flat panel.
		 */
		href?: string;
		/** The 7/30-day trend line (#90). Absent for a count with no history worth a shape. */
		sparkline?: Snippet;
		class?: string;
	}

	let { label, value, tone = 'neutral', href, sparkline, class: className }: Props = $props();

	const styles = $derived(kpiCard({ tone, actionable: href !== undefined }));
</script>

<!--
	A `<dl>` of one pair rather than two generic `div`s: a screen reader already
	knows "term, definition" without an extra `aria-label` repeating the same
	two strings back as a third one.
-->
{#snippet body()}
	<dt class={styles.label()}>{label}</dt>
	<dd class={styles.value()}>
		{#if typeof value === 'number'}
			<!--
				The number rolls when it *changes* (#90, constitution rule 1: never on
				mount). That is the library's own behaviour, not something arranged
				here — it builds its shadow DOM on the first `data` assignment and
				only animates on later ones, so the first paint is static for free.

				`NUMBER_FLOW_TIMING` is not optional politeness: the library ships a
				900ms transform, and `--motion-slow` (240ms) is this app's ceiling.

				Reduced motion is handled by the library's `respectMotionPreference`,
				which defaults on. It has to be: these animations run through
				`Element.animate()` inside a shadow root, so `app.css`'s global
				`prefers-reduced-motion` layer — a stylesheet rule on `*` in the outer
				document — cannot reach them. This is the one place in the app where
				that layer is not the backstop.
			-->
			<NumberFlow {value} locales={getLocale()} {...NUMBER_FLOW_TIMING} />
		{:else}
			{value}
		{/if}
	</dd>
	{#if sparkline}
		<div class={styles.spark()}>{@render sparkline()}</div>
	{/if}
{/snippet}

{#if href !== undefined}
	<a {href} class={styles.root({ class: className })} data-actionable="true">
		<dl class="contents">{@render body()}</dl>
	</a>
{:else}
	<dl class={styles.root({ class: className })}>{@render body()}</dl>
{/if}
