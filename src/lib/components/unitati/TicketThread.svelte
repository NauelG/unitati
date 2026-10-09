<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-thread` family: replies, internal notes and system events in one
	 * chronological rail. Replies carry an avatar; an internal note sits on
	 * `warning-soft` with its badge; an event is one muted line, because it is
	 * context, not conversation.
	 */
	export const thread = tv({
		slots: {
			list: 'm-0 flex list-none flex-col gap-[var(--space-4)] p-0',
			message: 'flex gap-[var(--space-3)]',
			card: 'min-w-0 flex-1 rounded-[var(--radius-lg)]',
			head: 'flex flex-wrap items-center gap-x-[var(--space-2)] gap-y-1 text-sm',
			author: 'font-medium text-[var(--ink)]',
			time: 'text-xs leading-4 text-[var(--ink-muted)] [font-variant-numeric:tabular-nums]',
			body: 'mt-[var(--space-1)] text-[15px] leading-[22px] whitespace-pre-wrap text-[var(--ink)]',
			files: 'mt-[var(--space-2)] m-0 flex list-none flex-wrap gap-[var(--space-2)] p-0',
			file: [
				'inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)]',
				'border border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-2)] py-1',
				'text-xs text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			event: 'ml-10 text-[13px] leading-[18px] text-[var(--ink-muted)]',
			empty: 'text-sm text-[var(--ink-muted)]'
		},
		variants: {
			internal: {
				true: { card: 'bg-[var(--warning-soft)] px-[var(--space-4)] py-[var(--space-3)]' }
			}
		}
	});
</script>

<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import { assetHref } from '#lib/domain/routes.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { ThreadItem } from '#lib/server/service-desk/index.js';
	import type { TimelineEntry } from '#lib/server/activity/index.js';
	import { activitySentence } from './activity.js';
	import Avatar from './Avatar.svelte';
	import RecordRef from './RecordRef.svelte';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		/** Oldest first, as `ticketThread` returns them. The component never reorders. */
		items: ThreadItem[];
		/** Where an attachment is served from; staff and portal have different routes. */
		attachmentHref: (attachmentId: string) => string;
		class?: string;
	}

	let { items, attachmentHref, class: className }: Props = $props();

	const styles = thread();

	/**
	 * The asset an entry is about, when it is a link event: every record a page
	 * mentions is a `RecordRef` so the reader can jump to it, and the tag and
	 * name come from the snapshot taken when the link was made, not from a lookup
	 * that could have been renamed since.
	 */
	function linkedAsset(entry: TimelineEntry) {
		if (entry.verb !== 'link.asset.added' && entry.verb !== 'link.asset.removed') return null;

		return {
			kind: 'asset' as const,
			tag: entry.payload.assetTag,
			title: entry.payload.assetName,
			href: assetHref(entry.payload.assetTag)
		};
	}

	// Per render, never at module scope: the locale is a per-request preference.
	const formatter = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
	);
</script>

{#if items.length === 0}
	<p class={styles.empty({ class: className })}>{m.timeline_empty()}</p>
{:else}
	<ol class={styles.list({ class: className })} aria-label={m.thread_title()}>
		{#each items as item (item.kind === 'comment' ? item.id : `${item.entry.id}`)}
			{#if item.kind === 'event'}
				{@const asset = linkedAsset(item.entry)}
				<li class={styles.event()}>
					{activitySentence(item.entry)}
					{#if asset}
						<RecordRef record={asset} />
					{/if}
					{#if item.entry.actorName}· {item.entry.actorName}{/if}
					·
					<time datetime={item.at.toISOString()}>{formatter.format(item.at)}</time>
				</li>
			{:else}
				<li class={styles.message()}>
					<Avatar name={item.authorName ?? '?'} />
					<div class={styles.card({ internal: item.visibility === 'internal' })}>
						<div class={styles.head()}>
							<span class={styles.author()}>{item.authorName ?? '—'}</span>
							{#if item.visibility === 'internal'}
								<span class={badge({ tone: 'warning', plain: true })}>
									{m.thread_internal_badge()}
								</span>
							{/if}
							<time class={styles.time()} datetime={item.createdAt.toISOString()}>
								{formatter.format(item.createdAt)}
							</time>
						</div>

						<p class={styles.body()}>{item.body}</p>

						{#if item.attachments.length > 0}
							<ul class={styles.files()} aria-label={m.thread_attachments()}>
								{#each item.attachments as file (file.id)}
									<li>
										<a
											class={styles.file()}
											href={attachmentHref(file.id)}
											download={file.filename}
											aria-label={m.thread_attachment_download({ filename: file.filename })}
										>
											<Paperclip class="size-3.5" aria-hidden="true" />
											{file.filename}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</li>
			{/if}
		{/each}
	</ol>
{/if}
