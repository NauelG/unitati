<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { AssetView } from '#lib/server/assets/index.js';
	import AssetsNav from './AssetsNav.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Not `$bindable` state of the URL: the box is seeded from it, and submitting
	// the form is what writes it back. The page is a function of the URL.
	let term = $derived(data.search);

	/**
	 * Only the columns the rows can fill. A list of nothing but shared rows has
	 * no model, state or custodian to show, and a column of dashes would suggest
	 * the data exists and is being withheld.
	 */
	const hasFullRows = $derived(data.result.rows.some((row) => row.visibility === 'full'));

	const columns = $derived<DataTableColumn<AssetView>[]>(
		hasFullRows
			? [
					{ key: 'tag', header: m.assets_column_tag(), cell: tag },
					{ key: 'name', header: m.assets_column_name(), cell: name },
					{ key: 'model', header: m.assets_column_model(), cell: model },
					{ key: 'state', header: m.assets_column_state(), cell: state },
					{ key: 'custodian', header: m.assets_column_custodian(), cell: custodian },
					{ key: 'location', header: m.assets_column_location(), cell: location }
				]
			: [
					{ key: 'tag', header: m.assets_column_tag(), cell: tag },
					{ key: 'name', header: m.assets_column_name(), cell: name },
					{ key: 'location', header: m.assets_column_location(), cell: location }
				]
	);

	const emptyMessage = $derived(
		data.search
			? m.assets_empty_search({ term: data.search })
			: data.seesWholeInventory
				? m.assets_empty()
				: m.assets_empty_limited()
	);

	function pageHref(target: number): string {
		// Built by hand rather than with `URLSearchParams`: this is a pure string
		// for an `href`, and a mutable reactive-looking object is the wrong tool.
		const parts = [
			data.search ? `q=${encodeURIComponent(data.search)}` : null,
			target > 1 ? `page=${target}` : null
		].filter((part) => part !== null);
		return parts.length > 0 ? `?${parts.join('&')}` : '?';
	}
</script>

{#snippet tag(row: AssetView)}{row.assetTag}{/snippet}
{#snippet name(row: AssetView)}{row.name}{/snippet}
{#snippet model(row: AssetView)}{row.visibility === 'full' ? row.modelName : '—'}{/snippet}
{#snippet state(row: AssetView)}
	{#if row.visibility === 'full'}<StatusBadge status={row.state} />{:else}—{/if}
{/snippet}
{#snippet custodian(row: AssetView)}
	{#if row.visibility !== 'full'}
		—
	{:else if row.custodianName}
		{row.custodianName}
	{:else}
		<span class="text-[var(--ink-muted)]">{m.assets_no_custodian()}</span>
	{/if}
{/snippet}
{#snippet location(row: AssetView)}{row.locationName ?? '—'}{/snippet}

<svelte:head>
	<title>{m.assets_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.assets_title()}>
		{#snippet summary()}
			{data.seesWholeInventory ? m.assets_lede() : m.assets_lede_limited()}
		{/snippet}
		{#snippet actions()}
			{#if data.canManage}
				<Button href="/assets/new">
					<Plus class="size-4" aria-hidden="true" />
					{m.assets_register()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<AssetsNav showCatalogue={data.canManage} />

	<form method="GET" role="search" class="mt-[var(--space-6)] flex items-end gap-[var(--space-3)]">
		<!-- layout-ok: a bounded search field, not a page container -->
		<Field
			label={m.assets_search_label()}
			name="q"
			type="search"
			placeholder={data.seesWholeInventory
				? m.assets_search_placeholder()
				: m.assets_search_placeholder_limited()}
			bind:value={term}
			class="w-full max-w-md"
		/>
		<Button type="submit" variant="secondary">
			<Search class="size-4" aria-hidden="true" />
			{m.assets_search_submit()}
		</Button>
	</form>

	<div class="mt-[var(--space-5)]">
		{#snippet registerAction()}
			{#if data.canManage && !data.search}
				<Button href="/assets/new" size="sm">{m.assets_register()}</Button>
			{/if}
		{/snippet}

		<DataTable
			{columns}
			rows={data.result.rows}
			rowKey={(row) => row.assetTag}
			rowLabel={(row) => row.name}
			href={(row) => `/assets/${encodeURIComponent(row.assetTag)}`}
			{emptyMessage}
			emptyAction={registerAction}
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
