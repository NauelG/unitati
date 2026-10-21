<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BellIcon from '@lucide/svelte/icons/bell';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { InboxItem } from '#lib/server/notifications/index.js';
	import Button from './Button.svelte';
	import { startUnreadPolling } from './notification-poll.js';
	import NotificationRow from './NotificationRow.svelte';

	interface Props {
		/** From the layout load; the poll takes over after that. */
		count: number;
		/** The full inbox: `/notifications` in the app, `/portal/notifications` in the portal. */
		inboxHref: string;
	}

	let { count: initialCount, inboxHref }: Props = $props();

	// Seeded by the layout and then owned by the poll; a fresh layout load (after
	// navigating, say) is newer than the last poll, so it wins again.
	let count = $derived(initialCount);

	let open = $state(false);
	let items = $state<(Omit<InboxItem, 'createdAt'> & { createdAt: string })[] | null>(null);

	const badge = $derived(count > 99 ? '99+' : String(count));

	async function fetchCount(): Promise<number | null> {
		try {
			const response = await fetch('/notifications/unread', {
				headers: { accept: 'application/json' }
			});
			if (!response.ok) return null;
			return ((await response.json()) as { count: number }).count;
		} catch {
			return null;
		}
	}

	$effect(() => startUnreadPolling({ fetchCount, onCount: (next) => (count = next) }));

	async function load() {
		try {
			const response = await fetch('/notifications/recent');
			if (response.ok) items = (await response.json()).items;
		} catch {
			items ??= [];
		}
	}

	$effect(() => {
		if (open) void load();
	});

	async function post(body: object): Promise<boolean> {
		try {
			const response = await fetch('/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async function openItem(event: MouseEvent, item: { id: string; href: string; read: boolean }) {
		// Let the browser handle "open in a new tab" and friends untouched.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		if (!item.read && (await post({ id: item.id }))) count = Math.max(0, count - 1);
		open = false;
		await goto(item.href);
		void invalidateAll();
	}

	async function markAll() {
		if (!(await post({ all: true }))) return;
		count = 0;
		items = items?.map((item) => ({ ...item, read: true })) ?? null;
		void invalidateAll();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				iconOnly
				class="relative"
				aria-label={m.notifications_bell_label({ n: count })}
			>
				<BellIcon class="size-[18px]" aria-hidden="true" />
				{#if count > 0}
					<span
						class="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-[var(--radius-full)] bg-[var(--action)] px-1 text-mono font-semibold text-[var(--on-action)] [font-variant-numeric:tabular-nums]"
						aria-hidden="true"
					>
						{badge}
					</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content align="end" class="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0">
		<header
			class="flex items-center justify-between gap-[var(--space-3)] border-b border-[var(--border)] px-[var(--space-4)] py-[var(--space-3)]"
		>
			<h2 class="text-sm font-semibold text-[var(--ink)]">{m.notifications_title()}</h2>
			<button
				type="button"
				class="text-xs font-medium text-[var(--action)] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45"
				disabled={count === 0}
				onclick={markAll}
			>
				{m.notifications_mark_all_read()}
			</button>
		</header>

		<div class="max-h-96 overflow-y-auto">
			{#if items === null}
				<p
					class="px-[var(--space-4)] py-[var(--space-6)] text-center text-sm text-[var(--ink-muted)]"
				>
					{m.notifications_loading()}
				</p>
			{:else if items.length === 0}
				<p
					class="px-[var(--space-4)] py-[var(--space-6)] text-center text-sm text-[var(--ink-muted)]"
				>
					{m.notifications_empty()}
				</p>
			{:else}
				<ul class="divide-y divide-[var(--border)]">
					{#each items as item (item.id)}
						<li>
							<a
								href={item.href}
								class="block px-[var(--space-4)] py-[var(--space-3)] hover:bg-[var(--surface-2)]"
								onclick={(event) => openItem(event, item)}
							>
								<NotificationRow
									type={item.type}
									snapshot={item.snapshot}
									read={item.read}
									createdAt={item.createdAt}
								/>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<footer
			class="border-t border-[var(--border)] px-[var(--space-4)] py-[var(--space-3)] text-center"
		>
			<a
				href={inboxHref}
				class="text-sm font-medium text-[var(--action)] hover:underline"
				onclick={() => (open = false)}
			>
				{m.notifications_view_all()}
			</a>
		</footer>
	</Popover.Content>
</Popover.Root>
