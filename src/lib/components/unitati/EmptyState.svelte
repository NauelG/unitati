<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The shared empty-grid shape (#86): one sentence told nobody anything, so
	 * every list/catalogue/table reached for its own ad hoc `<p>` instead of a
	 * component. `size="hero"` is the one-per-screen "no data yet" moment the
	 * design tokens reserve `--font-display` at 36px/700 for; `size="compact"`
	 * (the default) is the inline shape a `DataTable`'s empty grid or a narrow
	 * panel uses, where a 36px headline would outweigh everything around it.
	 *
	 * The caller decides "no data yet" vs "no matching filtered results" by
	 * passing different `title`/`description`/`action` — this component has no
	 * opinion on which sentence that is, only on how a sentence is framed.
	 */
	export const emptyState = tv({
		slots: {
			root: 'flex flex-col items-center gap-[var(--space-4)] text-center',
			disc: [
				'grid place-items-center rounded-[var(--radius-full)]',
				'bg-[var(--brand-soft)] text-[var(--brand)]'
			],
			title: 'text-[var(--ink)]',
			description: 'max-w-sm text-[var(--ink-muted)]',
			hint: [
				'inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)]',
				'border border-[var(--border)] px-[6px] font-mono text-xs text-[var(--ink-muted)]'
			]
		},
		variants: {
			size: {
				compact: {
					root: 'px-[var(--space-6)] py-[var(--space-12)]',
					disc: 'size-10',
					title: 'text-sm font-semibold',
					description: 'text-sm'
				},
				hero: {
					root: 'px-[var(--space-6)] py-[var(--space-16)]',
					disc: 'size-14',
					title: 'font-display text-[36px] leading-[42px] font-bold tracking-[-0.02em]',
					description: 'text-sm'
				}
			}
		},
		defaultVariants: { size: 'compact' }
	});

	export type EmptyStateSize = 'compact' | 'hero';
</script>

<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** A Lucide icon component, shown inside a soft brand disc. Omit for text only. */
		icon?: LucideIcon;
		/** Omit for the compact, no-headline shape used inline in a table/panel. */
		title?: string;
		/** One sentence. The only thing every empty state must say. */
		description: string;
		size?: EmptyStateSize;
		/** The primary action that resolves the emptiness — "Register the first…", "Clear filter". */
		action?: Snippet;
		/** A keyboard shortcut hint next to or under the action, e.g. "⌘K". */
		kbdHint?: Snippet;
		class?: string;
	}

	let {
		icon: Icon,
		title,
		description,
		size = 'compact',
		action,
		kbdHint,
		class: className
	}: Props = $props();

	const styles = $derived(emptyState({ size }));
	const iconSize = $derived(size === 'hero' ? 'size-6' : 'size-5');
</script>

<div class={styles.root({ class: className })}>
	{#if Icon}
		<div class={styles.disc()}>
			<Icon class={iconSize} aria-hidden="true" />
		</div>
	{/if}
	{#if title}
		<p class={styles.title()}>{title}</p>
	{/if}
	<p class={styles.description()}>{description}</p>
	{#if action}
		{@render action()}
	{/if}
	{#if kbdHint}
		<p class={styles.hint()}>
			{@render kbdHint()}
		</p>
	{/if}
</div>
