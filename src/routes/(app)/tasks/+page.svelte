<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Button from '#lib/components/unitati/Button.svelte';
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import MoveTaskDialog from '#lib/components/unitati/MoveTaskDialog.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { stateGroupLabel } from '#lib/components/unitati/status.js';
	import { STATE_GROUPS } from '#lib/domain/status.js';
	import { formatDay } from '#lib/format-date.js';
	import { formatKeys, isMacPlatform, keymapRegistry } from '#lib/keymap.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Row = PageProps['data']['tasks'][number];

	let term = $derived(data.search);
	let activeKey = $state<string | null>(null);
	/** The row whose "Mover a proyecto" dialog is open (#120). */
	let moving = $state<Row | null>(null);
	const mac = isMacPlatform();

	/**
	 * States chosen from a row and not yet reconciled (#89): the badge moves at
	 * once, and goes back if the server refuses. Cleared when the authoritative
	 * list arrives.
	 */
	let moved = $derived.by<Record<string, { name: string; group: Row['stateGroup'] }>>(() => {
		void data.tasks;
		return {};
	});

	const stateOptions = $derived(
		data.states.map((state) => ({ value: state.id, label: state.name }))
	);
	const scopeOptions = $derived([
		{ value: 'mine', label: m.tasks_filter_mine() },
		{ value: 'all', label: m.tasks_filter_all() }
	]);
	const groupOptions = $derived([
		{ value: '', label: m.tasks_filter_all_groups() },
		...STATE_GROUPS.map((group) => ({ value: group, label: stateGroupLabel(group) }))
	]);

	$effect(() => {
		return keymapRegistry.register({
			id: 'tasks.row.state',
			keys: ['s'],
			scope: 'list',
			group: m.keymap_group_projects(),
			label: m.keymap_entry_task_state(),
			permission: 'projects.manage',
			when: () => activeKey !== null,
			run: () => {
				if (!activeKey) return;
				document
					.querySelector<HTMLElement>(`form[data-state="${CSS.escape(activeKey)}"] button`)
					?.focus();
			}
		});
	});

	const columns = $derived<DataTableColumn<Row>[]>([
		{ key: 'tag', header: m.tasks_column_tag(), cell: tag },
		{ key: 'title', header: m.tasks_column_title(), cell: title },
		{ key: 'project', header: m.tasks_column_project(), cell: project },
		{ key: 'state', header: m.tasks_column_state(), cell: state },
		{ key: 'assignees', header: m.tasks_column_assignees(), cell: assignees },
		{ key: 'due', header: m.tasks_column_due(), cell: due },
		...(data.canManage
			? [{ key: 'actions', header: m.tasks_column_actions(), cell: actionsCell }]
			: [])
	]);

	const filtering = $derived(Boolean(data.search) || data.group !== '');
	const emptyTitle = $derived(data.search ? m.tasks_empty_search_title() : m.tasks_empty_title());
	const emptyMessage = $derived(
		data.search
			? m.tasks_empty_search({ term: data.search })
			: data.all
				? m.tasks_empty_all()
				: m.tasks_empty_mine()
	);
</script>

{#snippet tag(row: Row)}{row.taskTag}{/snippet}
{#snippet title(row: Row)}{row.title}{/snippet}
{#snippet project(row: Row)}
	<a href="/projects/{encodeURIComponent(row.projectTag)}" class="hover:underline">
		{row.projectName}
	</a>
{/snippet}
{#snippet state(row: Row)}
	{@const shown = moved[row.taskTag] ?? { name: row.stateName, group: row.stateGroup }}
	<StatusBadge status={shown.group} label={shown.name} />
{/snippet}
{#snippet assignees(row: Row)}
	{#if row.assignees.length > 0}
		{row.assignees.map((assignee) => assignee.fullName).join(', ')}
	{:else}
		<span class="text-[var(--ink-muted)]">{m.tasks_unassigned()}</span>
	{/if}
{/snippet}
{#snippet due(row: Row)}
	{#if row.dueDate}{formatDay(row.dueDate)}{:else}<span class="text-[var(--ink-muted)]">—</span
		>{/if}
{/snippet}
{#snippet actionsCell(row: Row)}
	{#if !row.projectArchived}
		<form
			method="POST"
			action="/tasks/{encodeURIComponent(row.taskTag)}?/changeState"
			data-state={row.taskTag}
			class="flex items-center gap-[var(--space-2)]"
			use:optimisticEnhance={(formData) => {
				const next = data.states.find((state) => state.id === formData.get('stateId'));
				const previous = moved[row.taskTag];
				if (next) moved = { ...moved, [row.taskTag]: { name: next.name, group: next.group } };
				return () => {
					const rest = Object.fromEntries(
						Object.entries(moved).filter(([tag]) => tag !== row.taskTag)
					);
					moved = previous ? { ...rest, [row.taskTag]: previous } : rest;
				};
			}}
		>
			<SelectField
				label={m.tasks_change_state()}
				labelHidden
				name="stateId"
				options={stateOptions}
				value={row.stateId}
			/>
			<Button type="submit" variant="ghost" size="sm">{m.tasks_change_state()}</Button>
			<Button type="button" variant="ghost" size="sm" onclick={() => (moving = row)}>
				<ArrowRightLeft class="size-4" aria-hidden="true" />
				{m.task_move_action()}
			</Button>
		</form>
	{/if}
{/snippet}

<svelte:head>
	<title>{documentTitle(m.tasks_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.tasks_title()}>
		{#snippet summary()}
			{#if data.tasks.length === 0}
				{m.tasks_lede()}
			{:else if data.tasks.length === 1}
				{m.tasks_summary_one({ count: data.tasks.length })}
			{:else}
				{m.tasks_summary_other({ count: data.tasks.length })}
			{/if}
		{/snippet}
		{#snippet actions()}
			<Button href="/projects" variant="secondary">{m.nav_projects()}</Button>
		{/snippet}
	</PageHeader>

	<form
		method="GET"
		role="search"
		class="mt-[var(--space-6)] flex flex-wrap items-end gap-[var(--space-3)]"
	>
		<!-- layout-ok: a bounded search field, not a page container -->
		<Field
			label={m.tasks_search_label()}
			name="q"
			type="search"
			placeholder={m.tasks_search_placeholder()}
			bind:value={term}
			class="w-full max-w-md"
		/>
		<span class="ut-kbd self-center" aria-hidden="true">{formatKeys(['/'], mac)}</span>
		{#if data.canSeeAll}
			<SelectField
				label={m.tasks_filter_scope()}
				name="filter"
				options={scopeOptions}
				value={data.all ? 'all' : 'mine'}
			/>
		{/if}
		<SelectField
			label={m.tasks_filter_group()}
			name="group"
			options={groupOptions}
			value={data.group}
		/>
		<Button type="submit" variant="secondary">
			<Search class="size-4" aria-hidden="true" />
			{m.tasks_search_submit()}
		</Button>
	</form>

	<div class="mt-[var(--space-5)]">
		{#snippet emptyAction()}
			{#if filtering}
				<Button href="?" variant="secondary" size="sm">{m.tasks_clear_filter()}</Button>
			{/if}
		{/snippet}

		<DataTable
			{columns}
			rows={data.tasks}
			rowKey={(row) => row.taskTag}
			rowLabel={(row) => row.title}
			href={(row) => `/tasks/${encodeURIComponent(row.taskTag)}`}
			bind:activeKey
			compact
			{emptyMessage}
			{emptyTitle}
			emptyIcon={data.search ? SearchX : ListChecks}
			{emptyAction}
		/>
	</div>
</PageLayout>

{#if data.canManage && moving}
	<MoveTaskDialog
		open
		onOpenChange={(next) => {
			if (!next) moving = null;
		}}
		task={{ taskTag: moving.taskTag, projectId: moving.projectId }}
		projects={data.projects}
	/>
{/if}
