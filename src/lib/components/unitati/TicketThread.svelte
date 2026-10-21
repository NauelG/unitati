<script lang="ts" module>
	import { tv } from '#lib/tv.js';
	import { prose } from './prose.js';

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
			edited: 'text-xs leading-4 text-[var(--ink-muted)]',
			editButton: [
				'ml-auto inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)]',
				'text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
			],
			editBar: 'mt-[var(--space-2)] flex items-center gap-[var(--space-2)]',
			editError: 'mt-[var(--space-2)] text-small text-[var(--danger)]',
			time: 'text-xs leading-4 text-[var(--ink-muted)] [font-variant-numeric:tabular-nums]',
			body: 'mt-[var(--space-1)] text-body-lg whitespace-pre-wrap text-[var(--ink)]',
			// Sanitised markdown from `renderMarkdown` (ADR 0030).
			prose: ['mt-[var(--space-1)] min-w-0', ...prose],
			files: 'mt-[var(--space-2)] m-0 flex list-none flex-wrap gap-[var(--space-2)] p-0',
			file: [
				'inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)]',
				'border border-[var(--border)] bg-[var(--surface-1)] px-[var(--space-2)] py-1',
				'text-xs text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			event: 'ml-10 text-small text-[var(--ink-muted)]',
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
	import Pencil from '@lucide/svelte/icons/pencil';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
	import { assetHref } from '#lib/domain/routes.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/format-date.js';
	import type { ThreadItem } from '#lib/server/service-desk/index.js';
	import type { TimelineEntry } from '#lib/server/activity/index.js';
	import { activitySentence } from './activity.js';
	import Avatar from './Avatar.svelte';
	import Button from './Button.svelte';
	import { fetchMentions } from './mention-source.js';
	import RichTextEditor from './RichTextEditor.svelte';
	import RecordRef from './RecordRef.svelte';
	import { badge } from './StatusBadge.svelte';

	interface Props {
		/** Oldest first, as `ticketThread` returns them. The component never reorders. */
		items: (ThreadItem | PendingThreadItem)[];
		/** Where an attachment is served from; staff and portal have different routes. */
		attachmentHref: (attachmentId: string) => string;
		/**
		 * The form action that saves an edited comment, e.g. `?/editComment`. Without
		 * it no "Editar" button is offered, whatever `canEdit` says.
		 */
		editAction?: string;
		/** Shown under the editor when the last save was refused. */
		editError?: string;
		/** The @mention endpoint (#303); the editor asks with the visibility of the comment being edited. */
		mentionsUrl?: string;
		class?: string;
	}

	let {
		items,
		attachmentHref,
		editAction,
		editError,
		mentionsUrl,
		class: className
	}: Props = $props();

	let editingId = $state<string | null>(null);
	let draft = $state('');
	let editForm = $state<HTMLFormElement | null>(null);
	/** Optimistic text (#89) per comment id, until the reloaded thread carries the same body. */
	let pendingBodies = $state<Record<string, string>>({});

	$effect(() => {
		for (const item of items) {
			if (item.kind === 'comment' && pendingBodies[item.id] === item.body) {
				delete pendingBodies[item.id];
			}
		}
	});

	function startEdit(item: Extract<ThreadItem, { kind: 'comment' }>) {
		draft = item.body;
		editingId = item.id;
	}

	function saveEdit() {
		if (draft.trim().length > 0 && draft.length <= RICH_TEXT_MAX_LENGTH) editForm?.requestSubmit();
	}

	function optimisticEdit(id: string, formData: FormData) {
		const next = formData.get('body');
		const sent = draft;
		if (typeof next === 'string') pendingBodies[id] = next;
		editingId = null;
		return () => {
			delete pendingBodies[id];
			draft = sent;
			editingId = id;
		};
	}

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
					<time datetime={item.at.toISOString()}>{formatDateTime(item.at)}</time>
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
								{formatDateTime(item.createdAt)}
							</time>
							{#if item.editedAt || pendingBodies[item.id] !== undefined}
								<span
									class={styles.edited()}
									title={item.editedAt
										? m.thread_edited_title({ date: formatDateTime(item.editedAt) })
										: undefined}>· {m.thread_edited()}</span
								>
							{/if}
							{#if editAction && item.canEdit && editingId !== item.id}
								<button
									type="button"
									class={styles.editButton()}
									aria-label={m.thread_edit()}
									title={m.thread_edit()}
									onclick={() => startEdit(item)}
								>
									<Pencil class="size-3.5" aria-hidden="true" />
								</button>
							{/if}
						</div>

						{#if editAction && editingId === item.id}
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<form
								bind:this={editForm}
								method="POST"
								action={editAction}
								class="mt-[var(--space-2)]"
								use:optimisticEnhance={(formData) => optimisticEdit(item.id, formData)}
								onkeydown={(event) => {
									if (event.key === 'Escape') {
										event.preventDefault();
										editingId = null;
									}
								}}
							>
								<input type="hidden" name="commentId" value={item.id} />
								<RichTextEditor
									name="body"
									label={m.thread_edit_label()}
									bind:value={draft}
									onsubmitshortcut={saveEdit}
									mentionSource={mentionsUrl
										? (query) =>
												fetchMentions(mentionsUrl, { q: query, visibility: item.visibility })
										: undefined}
								/>
								{#if editError}
									<p class={styles.editError()} role="alert">{editError}</p>
								{/if}
								<div class={styles.editBar()}>
									<Button
										type="submit"
										size="sm"
										disabled={draft.trim().length === 0 || draft.length > RICH_TEXT_MAX_LENGTH}
									>
										{m.ticket_action_submit()}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="secondary"
										onclick={() => (editingId = null)}
									>
										{m.form_cancel()}
									</Button>
								</div>
							</form>
						{:else if pendingBodies[item.id] !== undefined}
							<p class={styles.body()}>{pendingBodies[item.id]}</p>
						{:else}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
							<div class={styles.prose()}>{@html item.bodyHtml}</div>
						{/if}

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
