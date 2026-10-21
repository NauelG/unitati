<script lang="ts">
	import { formatRelative } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { NotificationType, Snapshot } from '#lib/server/notifications/index.js';
	import { notificationSentence } from './notification-sentence.js';

	interface Props {
		type: NotificationType;
		snapshot: Snapshot;
		read: boolean;
		/** A `Date`, or the ISO string a JSON response carries. */
		createdAt: Date | string;
	}

	let { type, snapshot, read, createdAt }: Props = $props();

	const when = $derived(formatRelative(new Date(createdAt)));
</script>

<!--
	What one notification looks like, in the bell and on the inbox page: the unread
	dot, the sentence, then the record code and how long ago. The dot is decorative;
	"Sin leer" is read out instead, so unread is not conveyed by colour alone.
-->
<span class="flex items-start gap-[var(--space-3)]">
	<span
		class="mt-1.5 size-2 shrink-0 rounded-[var(--radius-full)] {read
			? 'bg-transparent'
			: 'bg-[var(--action)]'}"
		aria-hidden="true"
	></span>
	<span class="min-w-0 flex-1">
		{#if !read}<span class="sr-only">{m.notifications_unread_item()}: </span>{/if}
		<span class="block text-sm text-pretty text-[var(--ink)] {read ? '' : 'font-medium'}">
			{notificationSentence(type, snapshot)}
		</span>
		<span class="mt-0.5 flex items-center gap-[var(--space-2)] text-xs text-[var(--ink-muted)]">
			<span class="font-mono">{snapshot.code}</span>
			<span aria-hidden="true">·</span>
			<span>{when}</span>
		</span>
	</span>
</span>
