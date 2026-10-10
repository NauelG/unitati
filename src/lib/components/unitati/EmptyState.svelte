<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The shared empty-grid shape (#86): one sentence told nobody anything, so
	 * every list/catalogue/table reached for its own ad hoc `<p>` instead of a
	 * component. Compact on purpose — the issue's own complaint was a 450px
	 * card for one sentence — so a title (when given), an icon disc and a
	 * description all stay modest; nothing here claims the `display` type
	 * role docs reserve for a true full-screen hero, because no page in this
	 * app needs that shape yet (speculative generality the #86 code review
	 * flagged and this drops rather than ship unused).
	 *
	 * The caller decides "no data yet" vs "no matching filtered results" by
	 * passing different `title`/`description`/`action` — this component has no
	 * opinion on which sentence that is, only on how a sentence is framed.
	 */
	export const emptyState = tv({
		slots: {
			root: 'flex flex-col items-center gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-12)] text-center',
			disc: [
				'grid size-10 place-items-center rounded-[var(--radius-full)]',
				'bg-[var(--brand-soft)] text-[var(--brand)]'
			],
			title: 'text-sm font-semibold text-[var(--ink)]',
			description: 'max-w-sm text-sm text-[var(--ink-muted)]',
			hint: [
				'inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)]',
				'border border-[var(--border)] px-[6px] font-mono text-xs text-[var(--ink-muted)]'
			]
		}
	});
</script>

<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** A Lucide icon component, shown inside a soft brand disc. Omit for text only. */
		icon?: LucideIcon;
		/** Omit for the plainer shape, e.g. a catalogue with nothing to say beyond the sentence. */
		title?: string;
		/** One sentence. The only thing every empty state must say. */
		description: string;
		/** The primary action that resolves the emptiness — "Register the first…", "Clear filter". */
		action?: Snippet;
		/** A keyboard shortcut hint next to or under the action, e.g. "⌘K". */
		kbdHint?: Snippet;
		class?: string;
	}

	let { icon: Icon, title, description, action, kbdHint, class: className }: Props = $props();

	const styles = emptyState();
</script>

<div class={styles.root({ class: className })}>
	{#if Icon}
		<div class={styles.disc()}>
			<Icon class="size-5" aria-hidden="true" />
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
