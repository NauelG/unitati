<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import type { InboxItem } from '#lib/server/notifications/index.js';
	import Button from './Button.svelte';
	import EmptyState from './EmptyState.svelte';
	import NotificationRow from './NotificationRow.svelte';

	type Item = Omit<InboxItem, 'createdAt'> & { createdAt: Date | string };

	interface Props {
		items: Item[];
		nextCursor: string | null;
		unreadOnly: boolean;
	}

	let { items: first, nextCursor: firstCursor, unreadOnly }: Props = $props();

	// The load's first page, plus whatever "Cargar más" appended. A new load (the
	// toggle, an action) replaces it.
	let extra = $state<Item[]>([]);
	let cursor = $derived(firstCursor);
	let loaded = $state<Item[] | null>(null);
	// A new load replaces what "Cargar más" appended.
	$effect.pre(() => {
		if (loaded !== first) {
			loaded = first;
			extra = [];
		}
	});

	const items = $derived([...first, ...extra]);
	let loading = $state(false);

	async function loadMore() {
		if (!cursor || loading) return;
		loading = true;
		try {
			const query = new URLSearchParams({ cursor, ...(unreadOnly ? { unread: '1' } : {}) });
			const response = await fetch(`/notifications/recent?${query}`);
			if (!response.ok) return;
			const next = (await response.json()) as { items: Item[]; nextCursor: string | null };
			extra = [...extra, ...next.items];
			cursor = next.nextCursor;
		} finally {
			loading = false;
		}
	}

	function toggleUnread(event: Event) {
		const url = new URL(page.url.href);
		if ((event.currentTarget as HTMLInputElement).checked) url.searchParams.set('unread', '1');
		else url.searchParams.delete('unread');
		void goto(url);
	}
</script>

<div class="mt-[var(--space-6)] space-y-[var(--space-4)]">
	<div class="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
		<label class="flex items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
			<input type="checkbox" checked={unreadOnly} onchange={toggleUnread} />
			{m.notifications_unread_only()}
		</label>

		<form method="POST" action="?/readAll" use:enhance>
			<Button type="submit" variant="secondary" size="sm">{m.notifications_mark_all_read()}</Button>
		</form>
	</div>

	{#if items.length === 0}
		<EmptyState description={m.notifications_empty()} />
	{:else}
		<ul
			class="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
		>
			{#each items as item (item.id)}
				<li>
					<!-- A form, not a link with a script: reading and going there is one POST that works without JavaScript. -->
					<form method="POST" action="?/read">
						<input type="hidden" name="id" value={item.id} />
						<input type="hidden" name="href" value={item.href} />
						<button
							type="submit"
							class="block w-full px-[var(--space-4)] py-[var(--space-3)] text-left hover:bg-[var(--surface-2)]"
						>
							<NotificationRow
								type={item.type}
								snapshot={item.snapshot}
								read={item.read}
								createdAt={item.createdAt}
							/>
						</button>
					</form>
				</li>
			{/each}
		</ul>

		{#if cursor}
			<div class="flex justify-center">
				<Button variant="secondary" busy={loading} onclick={loadMore}>
					{m.notifications_load_more()}
				</Button>
			</div>
		{/if}
	{/if}
</div>
