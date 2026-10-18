<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * `.ut-btn-group` (`components.css`): a pill track on `--surface-2` whose
	 * pressed item lifts onto `--surface-1`. Two modes, one look: options with an
	 * `href` render links (`aria-current="page"`, for a `?view=` switcher the
	 * server reads), the rest render buttons (`aria-pressed`).
	 */
	export const segmentedControl = tv({
		slots: {
			root: 'inline-flex gap-0.5 rounded-[var(--radius-full)] bg-[var(--surface-2)] p-[3px]',
			item: [
				'inline-flex h-[30px] items-center rounded-[var(--radius-full)] px-[var(--space-3)]',
				'text-label text-[var(--ink-muted)] transition-colors ut-transition-fast',
				'hover:text-[var(--ink)]'
			]
		},
		variants: {
			selected: {
				true: {
					item: 'bg-[var(--surface-1)] text-[var(--ink)] shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--border)]'
				},
				false: {}
			}
		},
		defaultVariants: { selected: false }
	});

	export interface SegmentedOption {
		id: string;
		label: string;
		/** Present: the option is a link and the control is navigation, not state. */
		href?: string;
	}
</script>

<script lang="ts">
	interface Props {
		options: SegmentedOption[];
		/** The selected option's `id`. */
		value: string;
		/** Fired on activation, for links too (a preference to store, say). */
		onchange?: (id: string) => void;
		'aria-label'?: string;
		class?: string;
	}

	let { options, value, onchange, 'aria-label': ariaLabel, class: className }: Props = $props();

	const styles = segmentedControl();
</script>

<div role="group" aria-label={ariaLabel} class={styles.root({ class: className })}>
	{#each options as option (option.id)}
		{@const selected = option.id === value}
		{#if option.href !== undefined}
			<a
				href={option.href}
				data-sveltekit-replacestate
				aria-current={selected ? 'page' : undefined}
				class={styles.item({ selected })}
				onclick={() => onchange?.(option.id)}
			>
				{option.label}
			</a>
		{:else}
			<button
				type="button"
				aria-pressed={selected}
				class={styles.item({ selected })}
				onclick={() => onchange?.(option.id)}
			>
				{option.label}
			</button>
		{/if}
	{/each}
</div>
