<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import RollingText from '#lib/components/unitati/RollingText.svelte';
	import { rollingSummary } from '#lib/rolling.js';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { TICKET_STATUSES } from '#lib/domain/status.js';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import { formatKeys, isMacPlatform, keymapRegistry } from '#lib/keymap.js';
	import { createUrgentArrivals } from '#lib/urgent-arrivals.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { TicketView } from '#lib/server/service-desk/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let term = $derived(data.search);

	/** Roving focus's active row (#88), read by the `s` keymap verb below. */
	let activeKey = $state<string | null>(null);
	const mac = isMacPlatform();

	$effect(() => {
		return keymapRegistry.register({
			id: 'tickets.new',
			keys: ['n'],
			scope: 'global',
			group: m.keymap_group_tickets(),
			label: m.keymap_entry_new_ticket(),
			permission: 'tickets.create',
			run: () => goto('/service-desk/new')
		});
	});

	$effect(() => {
		return keymapRegistry.register({
			id: 'tickets.row.status',
			keys: ['s'],
			scope: 'list',
			group: m.keymap_group_tickets(),
			label: m.keymap_entry_ticket_status(),
			permission: 'tickets.manage',
			when: () => activeKey !== null,
			run: () => {
				if (activeKey) goto(`/service-desk/${encodeURIComponent(activeKey)}#action-status`);
			}
		});
	});

	/**
	 * S2 (#91): a row that arrives flagged urgent/high after a refresh pulses
	 * its priority badge once. The tracker's first look is this page load, so
	 * nothing pulses on arrival here; a different filter or page is a new list,
	 * not a refresh (the `scope`).
	 */
	const urgentArrivals = createUrgentArrivals<TicketView>({
		key: (row) => row.ticketTag,
		isUrgent: (row) => row.priority === 'urgent' || row.priority === 'high'
	});
	const arrivedTags = $derived.by(() =>
		urgentArrivals.observe(
			data.result.rows,
			`${data.search}|${data.queueId}|${data.status}|${data.result.page}`
		)
	);

	const columns = $derived<DataTableColumn<TicketView>[]>([
		{ key: 'tag', header: m.tickets_column_tag(), cell: tag },
		{ key: 'subject', header: m.tickets_column_subject(), cell: subject },
		{ key: 'status', header: m.tickets_column_status(), cell: status },
		{ key: 'priority', header: m.tickets_column_priority(), cell: priority },
		{ key: 'queue', header: m.tickets_column_queue(), cell: queue },
		{ key: 'requester', header: m.tickets_column_requester(), cell: requester },
		{ key: 'assignee', header: m.tickets_column_assignee(), cell: assignee }
	]);

	const queueOptions = $derived([
		{ value: '', label: m.tickets_filter_all_queues() },
		...data.queues.map((queue) => ({ value: queue.id, label: queue.name }))
	]);
	const statusOptions = $derived([
		{ value: '', label: m.tickets_filter_all_statuses() },
		...TICKET_STATUSES.map((value) => ({ value, label: statusLabel(value) }))
	]);

	const filtering = $derived(Boolean(data.search || data.queueId || data.status));

	function pageHref(target: number): string {
		const parts = [
			data.search ? `q=${encodeURIComponent(data.search)}` : null,
			data.queueId ? `queue=${data.queueId}` : null,
			data.status ? `status=${data.status}` : null,
			target > 1 ? `page=${target}` : null
		].filter((part) => part !== null);
		return parts.length > 0 ? `?${parts.join('&')}` : '?';
	}
</script>

{#snippet tag(row: TicketView)}<span class="font-mono text-xs">{row.ticketTag}</span>{/snippet}
{#snippet subject(row: TicketView)}{row.subject}{/snippet}
{#snippet status(row: TicketView)}<StatusBadge status={row.status} />{/snippet}
{#snippet priority(row: TicketView)}<StatusBadge
		status={row.priority}
		arrived={arrivedTags.has(row.ticketTag)}
	/>{/snippet}
{#snippet queue(row: TicketView)}{row.queueName}{/snippet}
{#snippet requester(row: TicketView)}{row.requesterName}{/snippet}
{#snippet assignee(row: TicketView)}
	{#if row.assigneeName}
		{row.assigneeName}
	{:else}
		<span class="text-[var(--ink-muted)]">{m.tickets_no_assignee()}</span>
	{/if}
{/snippet}

<svelte:head>
	<title>{documentTitle(m.tickets_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.tickets_title()}>
		{#snippet summary()}
			{#if data.summary.open === 0}
				{m.tickets_lede()}
			{:else}
				<RollingText
					{...rollingSummary([
						[data.summary.open, m.tickets_summary_open_one, m.tickets_summary_open_other],
						[
							data.summary.waitingOnUser,
							m.tickets_summary_waiting_one,
							m.tickets_summary_waiting_other
						]
					])}
				/>
			{/if}
		{/snippet}
		{#snippet actions()}
			{#if data.canManage}
				<Button href="/settings/service-desk/queues" variant="secondary"
					>{m.tickets_queues()}</Button
				>
			{/if}
			{#if data.canCreate}
				<Button href="/service-desk/new">
					<Plus class="size-4" aria-hidden="true" />
					{m.tickets_new()}
					<span class="ut-btn-kbd">{formatKeys(['n'], mac)}</span>
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mt-[var(--space-6)]">
		<!--
			The toolbar borrows DataTable's own panel corners (ADR 0019) instead of
			drawing a second, separate container: `rounded-t-*`/`border-b-0` here,
			`rounded-t-none` on the table below, so one border reads as one panel.
		-->
		<form
			method="GET"
			role="search"
			class="flex flex-wrap items-end gap-[var(--space-3)] rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
		>
			<!-- layout-ok: a bounded search field, not a page container -->
			<Field
				label={m.tickets_search_label()}
				name="q"
				type="search"
				placeholder={m.tickets_search_placeholder()}
				bind:value={term}
				class="w-full max-w-md"
			/>
			<span class="ut-kbd self-center" aria-hidden="true">{formatKeys(['/'], mac)}</span>
			<SelectField
				label={m.tickets_filter_queue()}
				name="queue"
				options={queueOptions}
				value={data.queueId}
			/>
			<SelectField
				label={m.tickets_filter_status()}
				name="status"
				options={statusOptions}
				value={data.status}
			/>
			<Button type="submit" variant="secondary">
				<Search class="size-4" aria-hidden="true" />
				{m.tickets_search_submit()}
			</Button>
		</form>

		<DataTable
			{columns}
			rows={data.result.rows}
			rowKey={(row) => row.ticketTag}
			rowLabel={(row) => row.subject}
			href={(row) => `/service-desk/${encodeURIComponent(row.ticketTag)}`}
			bind:activeKey
			emptyMessage={filtering ? m.tickets_empty_search({ term: data.search }) : m.tickets_empty()}
			class="rounded-t-none"
		/>
	</div>

	{#if data.result.total > 0}
		<Pager
			class="mt-[var(--space-4)]"
			page={data.result.page}
			pageCount={data.result.pageCount}
			perPage={data.result.perPage}
			total={data.result.total}
			href={pageHref}
		/>
	{/if}
</PageLayout>
