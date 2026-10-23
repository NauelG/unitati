<script lang="ts">
	import { formatDateTime, formatRelative } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * A page's revisions, newest first (#324): the history screen, and the panel
	 * beside one revision. Each links to its read-only view.
	 */
	interface Props {
		revisions: { number: number; title: string; authorName: string | null; createdAt: Date }[];
		tag: string;
		/** The revision the page shows now. */
		current: number;
		/** The revision on screen, if any: marked as the current location. */
		selected?: number;
		label: string;
	}

	let { revisions, tag, current, selected, label }: Props = $props();
</script>

<ol class="flex flex-col divide-y divide-[var(--border)]" aria-label={label}>
	{#each revisions as revision (revision.number)}
		{@const createdAt = new Date(revision.createdAt)}
		<li
			class="flex flex-wrap items-baseline justify-between gap-x-[var(--space-4)] gap-y-[var(--space-1)] py-[var(--space-3)]"
		>
			<span class="flex min-w-0 flex-col">
				<a
					class="font-medium text-[var(--brand)] underline-offset-2 hover:underline aria-[current=page]:text-[var(--ink)] aria-[current=page]:no-underline"
					href={`/knowledge/${tag}/revisions/${revision.number}`}
					aria-current={revision.number === selected ? 'page' : undefined}
				>
					{m.knowledge_page_revision({ n: revision.number })}
					{#if revision.number === current}
						<span class="text-[var(--ink-muted)]">· {m.knowledge_revisions_current()}</span>
					{/if}
				</a>
				<span class="truncate text-small text-[var(--ink-muted)]">{revision.title}</span>
			</span>
			<span class="text-small text-[var(--ink-muted)]">
				{revision.authorName ?? m.knowledge_page_author_unknown()} ·
				<time datetime={createdAt.toISOString()} title={formatDateTime(createdAt)}>
					{formatRelative(createdAt)}
				</time>
			</span>
		</li>
	{/each}
</ol>
