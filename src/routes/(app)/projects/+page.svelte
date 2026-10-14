<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import { goto } from '$app/navigation';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import ProjectProgress from '#lib/components/unitati/ProjectProgress.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { formatDay } from '#lib/format-date.js';
	import { formatKeys, isMacPlatform, keymapRegistry } from '#lib/keymap.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Row = PageProps['data']['projects'][number];

	let term = $derived(data.search);
	let activeKey = $state<string | null>(null);
	const mac = isMacPlatform();

	/**
	 * Tags archived (or restored) from this list and not yet reconciled: the row
	 * leaves at once, and comes back if the server refuses (#89). Cleared when the
	 * authoritative list arrives.
	 */
	let departed = $state<string[]>([]);
	$effect(() => {
		void data.projects;
		departed = [];
	});
	const rows = $derived(data.projects.filter((row) => !departed.includes(row.projectTag)));

	const filterOptions = $derived([
		{ value: 'active', label: m.projects_filter_active() },
		{ value: 'archived', label: m.projects_filter_archived() }
	]);

	$effect(() => {
		return keymapRegistry.register({
			id: 'projects.new',
			keys: ['n'],
			scope: 'global',
			group: m.keymap_group_projects(),
			label: m.keymap_entry_new_project(),
			permission: 'projects.manage',
			run: () => goto('/projects/new')
		});
	});

	$effect(() => {
		return keymapRegistry.register({
			id: 'projects.row.archive',
			keys: ['a'],
			scope: 'list',
			group: m.keymap_group_projects(),
			label: m.keymap_entry_project_archive(),
			permission: 'projects.manage',
			when: () => activeKey !== null,
			run: () => {
				if (!activeKey) return;
				document
					.querySelector<HTMLFormElement>(`form[data-archive="${CSS.escape(activeKey)}"]`)
					?.requestSubmit();
			}
		});
	});

	const columns = $derived<DataTableColumn<Row>[]>([
		{ key: 'tag', header: m.projects_column_tag(), cell: tag },
		{ key: 'name', header: m.projects_column_name(), cell: name },
		{ key: 'owner', header: m.projects_column_owner(), cell: owner },
		{ key: 'due', header: m.projects_column_due(), cell: due },
		{ key: 'progress', header: m.projects_column_progress(), cell: progress },
		...(data.canManage
			? [{ key: 'actions', header: m.projects_column_actions(), cell: actionsCell }]
			: [])
	]);

	const filtering = $derived(Boolean(data.search) || data.archived);
	const emptyTitle = $derived(
		data.search ? m.projects_empty_search_title() : m.projects_empty_title()
	);
	const emptyMessage = $derived(
		data.search
			? m.projects_empty_search({ term: data.search })
			: data.archived
				? m.projects_empty_archived()
				: data.canManage
					? m.projects_empty()
					: m.projects_empty_limited()
	);
</script>

{#snippet tag(row: Row)}{row.projectTag}{/snippet}
{#snippet name(row: Row)}{row.name}{/snippet}
{#snippet owner(row: Row)}
	{#if row.ownerName}{row.ownerName}{:else}<span class="text-[var(--ink-muted)]">—</span>{/if}
{/snippet}
{#snippet due(row: Row)}
	{#if row.dueDate}{formatDay(row.dueDate)}{:else}<span class="text-[var(--ink-muted)]">—</span
		>{/if}
{/snippet}
{#snippet progress(row: Row)}
	<ProjectProgress counts={row.counts} class="w-44" />
{/snippet}
{#snippet actionsCell(row: Row)}
	<form
		method="POST"
		action="/projects/{encodeURIComponent(row.projectTag)}?/{row.archivedAt
			? 'unarchive'
			: 'archive'}"
		data-archive={row.projectTag}
		use:optimisticEnhance={() => {
			departed = [...departed, row.projectTag];
			return () => {
				departed = departed.filter((candidate) => candidate !== row.projectTag);
			};
		}}
	>
		<Button type="submit" variant="ghost" size="sm">
			{#if row.archivedAt}
				<ArchiveRestore class="size-4" aria-hidden="true" />
				{m.projects_unarchive()}
			{:else}
				<Archive class="size-4" aria-hidden="true" />
				{m.projects_archive()}
			{/if}
		</Button>
	</form>
{/snippet}

<svelte:head>
	<title>{m.projects_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.projects_title()}>
		{#snippet summary()}
			{#if data.projects.length === 0 || data.archived}
				{data.canManage ? m.projects_lede() : m.projects_lede_limited()}
			{:else if data.projects.length === 1}
				{m.projects_summary_one({ count: data.projects.length })}
			{:else}
				{m.projects_summary_other({ count: data.projects.length })}
			{/if}
		{/snippet}
		{#snippet actions()}
			<Button href="/tasks" variant="secondary">{m.projects_view_tasks()}</Button>
			{#if data.canManage}
				<Button href="/projects/new">
					<Plus class="size-4" aria-hidden="true" />
					{m.projects_new()}
					<span class="ut-btn-kbd">{formatKeys(['n'], mac)}</span>
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
			label={m.projects_search_label()}
			name="q"
			type="search"
			placeholder={m.projects_search_placeholder()}
			bind:value={term}
			class="w-full max-w-md"
		/>
		<span class="ut-kbd self-center" aria-hidden="true">{formatKeys(['/'], mac)}</span>
		<SelectField
			label={m.projects_filter_state()}
			name="filter"
			options={filterOptions}
			value={data.archived ? 'archived' : 'active'}
		/>
		<Button type="submit" variant="secondary">
			<Search class="size-4" aria-hidden="true" />
			{m.projects_search_submit()}
		</Button>
	</form>

	<div class="mt-[var(--space-5)]">
		{#snippet emptyAction()}
			{#if filtering}
				<Button href="?" variant="secondary" size="sm">{m.projects_clear_filter()}</Button>
			{:else if data.canManage}
				<Button href="/projects/new" size="sm">{m.projects_new()}</Button>
			{/if}
		{/snippet}

		<DataTable
			{columns}
			{rows}
			rowKey={(row) => row.projectTag}
			rowLabel={(row) => row.name}
			href={(row) => `/projects/${encodeURIComponent(row.projectTag)}`}
			bind:activeKey
			compact
			{emptyMessage}
			{emptyTitle}
			emptyIcon={data.search ? SearchX : FolderKanban}
			{emptyAction}
		/>
	</div>
</PageLayout>
