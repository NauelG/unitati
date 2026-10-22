<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * What a record's people said about it: a composer and the thread, newest
	 * first, in a card of its own. The rail beside it (`AssetTimeline`) is the
	 * history of what happened; a comment also lands there, but is written and
	 * read here.
	 *
	 * Presentation only: the page loads the comments, decides `canComment` and
	 * owns the form action. Works the same for assets, tasks, projects and people.
	 */
	export const commentsCard = tv({
		slots: {
			form: 'flex flex-col items-end gap-[var(--space-2)]',
			list: 'mt-[var(--space-4)] space-y-[var(--space-4)]',
			item: 'border-t border-[var(--border)] pt-[var(--space-3)] first:border-t-0 first:pt-0',
			meta: 'flex flex-wrap items-baseline gap-x-[var(--space-2)] text-small text-[var(--ink-muted)]',
			author: 'text-label text-[var(--ink)]',
			body: 'mt-[var(--space-1)] text-sm leading-5 whitespace-pre-wrap text-[var(--ink)]',
			empty: 'text-small text-[var(--ink-muted)]'
		}
	});
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/format-date.js';
	import Button from './Button.svelte';
	import FormError from './FormError.svelte';
	import TextAreaField from './TextAreaField.svelte';
	import WorkPanel from './WorkPanel.svelte';

	export type CommentItem = {
		id: string;
		body: string;
		authorName: string | null;
		createdAt: Date;
	};

	interface Props {
		comments: CommentItem[];
		/** The form action that adds one, e.g. `?/addComment`. */
		action: string;
		/** Without it the card is a read-only thread and renders no composer. */
		canComment: boolean;
		/** The server's refusal for this form, if the last post failed. */
		error?: string;
		/** Pass a stable id to let the keymap or a link jump here. */
		id?: string;
	}

	let { comments, action, canComment, error, id }: Props = $props();

	const styles = commentsCard();
</script>

<WorkPanel heading={m.comments_title()} {id}>
	{#if canComment}
		<form method="POST" {action} use:enhance class={styles.form()}>
			<TextAreaField
				class="w-full"
				label={m.comments_label()}
				name="text"
				required
				placeholder={m.comments_placeholder()}
			/>
			<FormError>{error}</FormError>
			<Button type="submit" variant="secondary" size="sm">{m.comments_submit()}</Button>
		</form>
	{/if}

	{#if comments.length === 0}
		<p class={styles.empty({ class: canComment ? 'mt-[var(--space-4)]' : '' })}>
			{m.comments_empty()}
		</p>
	{:else}
		<ul class={styles.list()}>
			{#each comments as comment (comment.id)}
				<li class={styles.item()}>
					<p class={styles.meta()}>
						<span class={styles.author()}>{comment.authorName ?? m.comments_author_unknown()}</span>
						<time datetime={comment.createdAt.toISOString()}>
							{formatDateTime(comment.createdAt)}
						</time>
					</p>
					<p class={styles.body()}>{comment.body}</p>
				</li>
			{/each}
		</ul>
	{/if}
</WorkPanel>
