<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import { goto } from '$app/navigation';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { formatKeys, isMacPlatform, keymapRegistry } from '#lib/keymap.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AssetView } from '#lib/server/assets/index.js';
	import AssetsNav from './AssetsNav.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Not `$bindable` state of the URL: the box is seeded from it, and submitting
	// the form is what writes it back. The page is a function of the URL.
	let term = $derived(data.search);

	/** Roving focus's active row (#88), read by the `a`/`e`/`l` keymap verbs below. */
	let activeKey = $state<string | null>(null);
	const mac = isMacPlatform();

	$effect(() => {
		return keymapRegistry.register({
			id: 'assets.new',
			keys: ['n'],
			scope: 'global',
			group: m.keymap_group_assets(),
			label: m.keymap_entry_new_asset(),
			permission: 'assets.manage',
			run: () => goto('/assets/new')
		});
	});

	$effect(() => {
		function openPanel(hash: string) {
			if (activeKey) goto(`/assets/${encodeURIComponent(activeKey)}${hash}`);
		}
		const unregisters = [
			keymapRegistry.register({
				id: 'assets.row.custody',
				keys: ['a'],
				scope: 'list',
				group: m.keymap_group_assets(),
				label: m.keymap_entry_asset_custody(),
				permission: 'assets.checkout',
				when: () => activeKey !== null,
				run: () => openPanel('#action-custody')
			}),
			keymapRegistry.register({
				id: 'assets.row.state',
				keys: ['e'],
				scope: 'list',
				group: m.keymap_group_assets(),
				label: m.keymap_entry_asset_state(),
				permission: 'assets.manage',
				when: () => activeKey !== null,
				run: () => openPanel('#action-state')
			}),
			keymapRegistry.register({
				id: 'assets.row.location',
				keys: ['l'],
				scope: 'list',
				group: m.keymap_group_assets(),
				label: m.keymap_entry_asset_location(),
				permission: 'assets.manage',
				when: () => activeKey !== null,
				run: () => openPanel('#action-location')
			})
		];
		return () => unregisters.forEach((unregister) => unregister());
	});

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
	// "No matching filtered results" is a different empty shape from "no data
	// yet" (#86): the icon and title say which one this is, and only the
	// no-results case offers a clear-filter action — not "register the first
	// asset", which would be a non-sequitur once a search is active.
	const emptyTitle = $derived(data.search ? m.assets_empty_search_title() : m.assets_empty_title());
	const emptyIcon = $derived(data.search ? SearchX : Inbox);

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
			{data.summary.total === 0
				? data.seesWholeInventory
					? m.assets_lede()
					: m.assets_lede_limited()
				: `${data.summary.total === 1 ? m.assets_summary_total_one() : m.assets_summary_total_other({ count: data.summary.total })} · ${data.summary.unassigned === 1 ? m.assets_summary_unassigned_one() : m.assets_summary_unassigned_other({ count: data.summary.unassigned })}`}
		{/snippet}
		{#snippet actions()}
			{#if data.canManage}
				<Button href="/assets/new">
					<Plus class="size-4" aria-hidden="true" />
					{m.assets_register()}
					<span class="ut-btn-kbd">{formatKeys(['n'], mac)}</span>
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
		<span class="ut-kbd self-center" aria-hidden="true">{formatKeys(['/'], mac)}</span>
		<Button type="submit" variant="secondary">
			<Search class="size-4" aria-hidden="true" />
			{m.assets_search_submit()}
		</Button>
	</form>

	<div class="mt-[var(--space-5)]">
		{#snippet emptyAction()}
			{#if data.search}
				<Button href="?" variant="secondary" size="sm">{m.assets_clear_filter()}</Button>
			{:else if data.canManage}
				<Button href="/assets/new" size="sm">{m.assets_register()}</Button>
			{/if}
		{/snippet}
		{#snippet emptyKbdHint()}
			{#if !data.search && data.canManage}
				{m.keymap_hint_new()}
			{/if}
		{/snippet}

		<DataTable
			{columns}
			rows={data.result.rows}
			rowKey={(row) => row.assetTag}
			rowLabel={(row) => row.name}
			href={(row) => `/assets/${encodeURIComponent(row.assetTag)}`}
			bind:activeKey
			compact
			{emptyMessage}
			{emptyTitle}
			{emptyIcon}
			{emptyAction}
			{emptyKbdHint}
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
