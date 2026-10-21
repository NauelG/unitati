<script lang="ts">
	import FileSignature from '@lucide/svelte/icons/file-signature';
	import { formatDateTime } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { HandoverListItem } from '#lib/server/assets/index.js';
	import DataTable, { type DataTableColumn } from './DataTable.svelte';
	import { handoverDirectionLabel } from './handover-state.js';
	import HandoverStateBadge from './HandoverStateBadge.svelte';

	interface Props {
		rows: HandoverListItem[];
		emptyMessage: string;
		/** The person's own page and the portal already say whose they are. */
		showPerson?: boolean;
		loading?: boolean;
		class?: string;
	}

	let {
		rows,
		emptyMessage,
		showPerson = true,
		loading = false,
		class: className
	}: Props = $props();

	const columns = $derived<DataTableColumn<HandoverListItem>[]>([
		{ key: 'code', header: m.handovers_column_code(), cell: code },
		...(showPerson ? [{ key: 'person', header: m.handovers_column_person(), cell: person }] : []),
		{ key: 'direction', header: m.handovers_column_direction(), cell: direction },
		{ key: 'assets', header: m.handovers_column_assets(), align: 'end' as const, cell: assets },
		{ key: 'issued', header: m.handovers_column_issued(), cell: issued },
		{ key: 'expires', header: m.handovers_column_expires(), cell: expires },
		{ key: 'issuer', header: m.handovers_column_issuer(), cell: issuer },
		{ key: 'state', header: m.handovers_column_state(), cell: state }
	]);
</script>

{#snippet code(row: HandoverListItem)}{row.code}{/snippet}
{#snippet person(row: HandoverListItem)}{row.personName}{/snippet}
{#snippet direction(row: HandoverListItem)}{handoverDirectionLabel(row.direction)}{/snippet}
{#snippet assets(row: HandoverListItem)}{row.assetCount}{/snippet}
{#snippet issued(row: HandoverListItem)}{formatDateTime(row.issuedAt)}{/snippet}
{#snippet expires(row: HandoverListItem)}
	{row.expiresAt ? formatDateTime(row.expiresAt) : '—'}
{/snippet}
{#snippet issuer(row: HandoverListItem)}{row.issuedByName ?? '—'}{/snippet}
{#snippet state(row: HandoverListItem)}<HandoverStateBadge state={row.state} />{/snippet}

<DataTable
	{columns}
	{rows}
	rowKey={(row) => row.code}
	rowLabel={(row) => row.code}
	href={(row) => `/assets/handovers/${encodeURIComponent(row.code)}`}
	compact
	{loading}
	emptyIcon={FileSignature}
	{emptyMessage}
	class={className}
/>
