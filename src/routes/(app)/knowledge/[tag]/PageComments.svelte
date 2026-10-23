<script lang="ts">
	import { enhance } from '$app/forms';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Avatar from '#lib/components/unitati/Avatar.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { fetchMentions } from '#lib/components/unitati/mention-source.js';
	import { prose } from '#lib/components/unitati/prose.js';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { RICH_TEXT_MAX_LENGTH } from '#lib/domain/rich-text.js';
	import { formatDateTime } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * The staff conversation about a page (#326): a flat list, oldest first, and a
	 * composer. Presentation only: the page loads the comments and owns the two
	 * form actions. On an archived page the list is all there is.
	 */

	type Comment = {
		id: string;
		authorName: string | null;
		bodyHtml: string;
		body: string;
		createdAt: Date;
		editedAt: Date | null;
		canEdit: boolean;
	};

	interface Props {
		comments: Comment[];
		archived: boolean;
		/** Where the @ picker asks, e.g. `/knowledge/DOC-0012/mentions`. */
		mentionsUrl: string;
		/** The server's refusal of the last comment, if any. */
		error?: string | null;
		/** The server's refusal of the last edit, if any. */
		editError?: string | null;
	}

	let { comments, archived, mentionsUrl, error, editError }: Props = $props();

	let body = $state('');
	let editingId = $state<string | null>(null);
	let draft = $state('');

	const source = (query: string) => fetchMentions(mentionsUrl, { q: query });
	const valid = (text: string) => text.trim().length > 0 && text.length <= RICH_TEXT_MAX_LENGTH;

	function startEdit(comment: Comment) {
		draft = comment.body;
		editingId = comment.id;
	}
</script>

<WorkPanel heading={m.knowledge_comments_title()} id="comments">
	{#if archived}
		<p class="text-small text-[var(--ink-muted)]">{m.knowledge_comments_archived()}</p>
	{:else}
		<form
			method="POST"
			action="?/addComment"
			class="flex flex-col items-end gap-[var(--space-2)]"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') body = '';
				}}
		>
			<RichTextEditor
				name="body"
				class="w-full"
				label={m.knowledge_comments_label()}
				placeholder={m.knowledge_comments_placeholder()}
				bind:value={body}
				mentionSource={source}
			/>
			<FormError>{error}</FormError>
			<Button type="submit" variant="secondary" size="sm" disabled={!valid(body)}>
				{m.knowledge_comments_submit()}
			</Button>
		</form>
	{/if}

	{#if comments.length === 0}
		<p class="mt-[var(--space-4)] text-small text-[var(--ink-muted)]">
			{m.knowledge_comments_empty()}
		</p>
	{:else}
		<ol class="mt-[var(--space-4)] space-y-[var(--space-4)]">
			{#each comments as comment (comment.id)}
				<li
					id={`comment-${comment.id}`}
					class="flex gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-3)] first:border-t-0 first:pt-0"
				>
					<Avatar name={comment.authorName ?? '?'} />
					<div class="min-w-0 flex-1">
						<div
							class="flex flex-wrap items-baseline gap-x-[var(--space-2)] text-small text-[var(--ink-muted)]"
						>
							<span class="text-label text-[var(--ink)]">
								{comment.authorName ?? m.comments_author_unknown()}
							</span>
							<time datetime={comment.createdAt.toISOString()}>
								{formatDateTime(comment.createdAt)}
							</time>
							{#if comment.editedAt}
								<span
									title={m.knowledge_comments_edited_title({
										date: formatDateTime(comment.editedAt)
									})}
								>
									· {m.knowledge_comments_edited()}
								</span>
							{/if}
							{#if comment.canEdit && editingId !== comment.id}
								<button
									type="button"
									class="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]"
									aria-label={m.knowledge_comments_edit()}
									title={m.knowledge_comments_edit()}
									onclick={() => startEdit(comment)}
								>
									<Pencil class="size-3.5" aria-hidden="true" />
								</button>
							{/if}
						</div>

						{#if editingId === comment.id}
							<form
								method="POST"
								action="?/editComment"
								class="mt-[var(--space-2)]"
								use:enhance={() =>
									async ({ result, update }) => {
										await update({ reset: false });
										if (result.type === 'success') editingId = null;
									}}
							>
								<input type="hidden" name="commentId" value={comment.id} />
								<RichTextEditor
									name="body"
									label={m.knowledge_comments_edit_label()}
									bind:value={draft}
									mentionSource={source}
								/>
								<FormError>{editError}</FormError>
								<div class="mt-[var(--space-2)] flex gap-[var(--space-2)]">
									<Button type="submit" size="sm" disabled={!valid(draft)}>
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
						{:else}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
							<div class={[prose, 'mt-[var(--space-1)]']}>{@html comment.bodyHtml}</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</WorkPanel>
