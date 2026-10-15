<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-thread` family: replies, internal notes and system events in one
	 * chronological rail. Every reply is a bounded card now (ADR 0019) — a public
	 * reply on `surface-1` with a border, an internal note on `warning-soft`
	 * with its badge — rather than a public message floating borderless on
	 * whatever sits behind the thread. An event is one muted line, because it is
	 * context, not conversation.
	 */
	/**
	 * The optimistic reply (#89): shaped like the `comment` branch of
	 * `ThreadItem` minus everything the server alone can assign (`id` from the
	 * database, `attachments` from the upload it hasn't finished yet). The
	 * caller (a record detail page) appends one of these the instant
	 * `TicketComposer` submits and drops it again once the real comment
	 * reconciles in or the submission fails.
	 */
	export interface PendingThreadItem {
		kind: 'pending';
		key: string;
		authorName: string | null;
		visibility: 'public' | 'internal';
		body: string;
	}

	export const thread = tv({
		slots: {
			list: 'm-0 flex list-none flex-col gap-[var(--space-4)] p-0',
			message: 'flex gap-[var(--space-3)]',
			card: [
				'min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--border)]',
				'bg-[var(--surface-1)] px-[var(--space-4)] py-[var(--space-3)]'
			],
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
				true: { card: 'border-transparent bg-[var(--warning-soft)]' }
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
		items: (ThreadItem | PendingThreadItem)[];
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
		{#each items as item (item.kind === 'comment' ? item.id : item.kind === 'pending' ? item.key : `${item.entry.id}`)}
			{#if item.kind === 'event'}
				{@const asset = linkedAsset(item.entry)}
				<li class={styles.event()}>
					{activitySentence(item.entry)}
					{#if asset}
						<RecordRef record={asset} />
					{/if}
					{#if item.entry.actorName}· {item.entry.actorName}
						{#if item.entry.actorServiceAccountId}
							<span class={badge({ tone: 'neutral', plain: true })}>
								{m.timeline_service_tag()}
							</span>
						{/if}
					{/if}
					·
					<time datetime={item.at.toISOString()}>{formatter.format(item.at)}</time>
				</li>
			{:else if item.kind === 'pending'}
				<!-- Perceived speed (#89): the reply the visitor just sent, before the
				     server has echoed it back. Same card, dimmed, with `aria-busy`
				     rather than a second visual language for "this isn't real yet". -->
				<li class={styles.message()} aria-busy="true">
					<Avatar name={item.authorName ?? '?'} />
					<div
						class={styles.card({ internal: item.visibility === 'internal' })}
						style:opacity="0.6"
					>
						<div class={styles.head()}>
							<span class={styles.author()}>{item.authorName ?? '—'}</span>
							{#if item.visibility === 'internal'}
								<span class={badge({ tone: 'warning', plain: true })}>
									{m.thread_internal_badge()}
								</span>
							{/if}
							<span class={styles.time()}>{m.composer_pending()}</span>
						</div>
						<p class={styles.body()}>{item.body}</p>
					</div>
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
