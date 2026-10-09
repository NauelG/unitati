<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '#lib/components/unitati/Button.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const formatter = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }));
</script>

<svelte:head>
	<title>{m.portal_title()} · {m.app_name()}</title>
</svelte:head>

<div class="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
	<div>
		<h1 class="font-display text-2xl font-semibold text-[var(--ink)]">{m.portal_title()}</h1>
		<p class="mt-2 text-[var(--ink-muted)]">{m.portal_lede()}</p>
	</div>
	<Button href="/portal/tickets/new">
		<Plus class="size-4" aria-hidden="true" />
		{m.portal_new()}
	</Button>
</div>

{#if data.result.rows.length === 0}
	<p class="mt-[var(--space-8)] text-sm text-[var(--ink-muted)]">{m.portal_empty()}</p>
{:else}
	<ul class="mt-[var(--space-6)] divide-y divide-[var(--border)]">
		{#each data.result.rows as ticket (ticket.id)}
			<li>
				<a
					href="/portal/tickets/{encodeURIComponent(ticket.ticketTag)}"
					class="flex items-center justify-between gap-[var(--space-4)] py-[var(--space-3)] hover:bg-[var(--surface-2)]"
				>
					<span class="min-w-0">
						<span class="font-mono text-xs text-[var(--ink-muted)]">{ticket.ticketTag}</span>
						<span class="block truncate text-[var(--ink)]">{ticket.subject}</span>
					</span>
					<span class="flex shrink-0 items-center gap-[var(--space-3)]">
						<span class="text-xs text-[var(--ink-muted)]">{formatter.format(ticket.updatedAt)}</span
						>
						<StatusBadge status={ticket.status} />
					</span>
				</a>
			</li>
		{/each}
	</ul>

	<Pager
		class="mt-[var(--space-4)]"
		page={data.result.page}
		pageCount={data.result.pageCount}
		perPage={data.result.perPage}
		total={data.result.total}
		href={(target) => (target > 1 ? `?page=${target}` : '?')}
	/>
{/if}
