<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { TICKET_STATUSES } from '#lib/domain/status.js';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { TicketView } from '#lib/server/service-desk/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let term = $derived(data.search);

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
{#snippet priority(row: TicketView)}<StatusBadge status={row.priority} />{/snippet}
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
	<title>{m.tickets_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.tickets_title()}>
		{#snippet summary()}{m.tickets_lede()}{/snippet}
		{#snippet actions()}
			{#if data.canManage}
				<Button href="/service-desk/queues" variant="secondary">{m.tickets_queues()}</Button>
			{/if}
			{#if data.canCreate}
				<Button href="/service-desk/new">
					<Plus class="size-4" aria-hidden="true" />
					{m.tickets_new()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<form
		method="GET"
		role="search"
		class="mt-[var(--space-6)] flex flex-wrap items-end gap-[var(--space-3)]"
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

	<div class="mt-[var(--space-5)]">
		<DataTable
			{columns}
			rows={data.result.rows}
			rowKey={(row) => row.ticketTag}
			rowLabel={(row) => row.subject}
			href={(row) => `/service-desk/${encodeURIComponent(row.ticketTag)}`}
			emptyMessage={filtering ? m.tickets_empty_search({ term: data.search }) : m.tickets_empty()}
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
