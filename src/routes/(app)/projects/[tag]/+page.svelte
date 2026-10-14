<script lang="ts">
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import {
		readStoredBoardPreference,
		resolveView,
		storeBoardPreference
	} from '#lib/board-preference.js';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import ProjectProgress from '#lib/components/unitati/ProjectProgress.svelte';
	import RollingNumber from '#lib/components/unitati/RollingNumber.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import StatusBadge, { badge } from '#lib/components/unitati/StatusBadge.svelte';
	import { stateGroupLabel } from '#lib/components/unitati/status.js';
	import TaskBoard from '#lib/components/unitati/TaskBoard.svelte';
	import TaskBoardSkeleton from '#lib/components/unitati/TaskBoardSkeleton.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
	import { formatDay } from '#lib/format-date.js';
	import { keymapRegistry } from '#lib/keymap.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const project = $derived(data.project);

	/**
	 * Archiving is optimistic and needs no confirmation: both directions are
	 * reversible (#89). The mirror flips on submit and rolls back on a refusal;
	 * every write control below hangs off it, so the moment a project reads as
	 * archived they are gone from the DOM, not disabled.
	 */
	let archived = $derived(data.project.archivedAt !== null);
	const writable = $derived(data.canManage && !archived);

	let editOpen = $state(false);
	let taskOpen = $state(false);
	/** The column a quick create was opened from; `null` is the domain's default state. */
	let taskStateId = $state<string | null>(null);
	let saving = $state(false);
	let ownerPersonId = $state<string | null>(null);

	const ownerOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

	/** The Sheet starts from the record every time it opens, not from a draft that went stale. */
	function openEdit() {
		ownerPersonId = project.ownerPersonId;
		editOpen = true;
	}

	const quickCreateState = $derived(data.states.find((state) => state.id === taskStateId));

	function openTask(stateId: string | null) {
		taskStateId = stateId;
		taskOpen = true;
	}

	const failureFor = (action: string) =>
		form && 'action' in form && form.action === action && 'message' in form
			? String(form.message)
			: undefined;

	$effect(() => {
		return keymapRegistry.register({
			id: 'projects.record.new-task',
			keys: ['n'],
			scope: 'record',
			group: m.keymap_group_projects(),
			label: m.project_new_task(),
			permission: 'projects.manage',
			when: () => writable,
			run: () => openTask(null)
		});
	});

	/** Tasks grouped by their state, in board order (the domain already sorted them). */
	const columns = $derived(
		data.tasks.reduce<{ id: string; name: string; group: StateGroup; tasks: typeof data.tasks }[]>(
			(accumulated, task) => {
				const column = accumulated.find((candidate) => candidate.id === task.stateId);
				if (column) column.tasks.push(task);
				else
					accumulated.push({
						id: task.stateId,
						name: task.stateName,
						group: task.stateGroup,
						tasks: [task]
					});
				return accumulated;
			},
			[]
		)
	);

	/** `?view=` picks the board or the #124 list; without it, the stored choice (#127). */
	const view = $derived(data.view);

	/** The board is on its way: paint its shape instead of an empty page. */
	const boardLoading = $derived(
		navigating.to?.params?.tag === project.projectTag &&
			resolveView(navigating.to.url.searchParams.get('view'), readStoredBoardPreference().view) ===
				'board'
	);

	const views = $derived([
		{ id: 'board', label: m.board_view_board(), href: '?view=board' },
		{ id: 'list', label: m.board_view_list(), href: '?view=list' }
	]);
</script>

{#snippet failure(action: string)}
	{@const message = failureFor(action)}
	{#if message}
		<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">{message}</p>
	{/if}
{/snippet}

{#snippet detail(label: string, value: string | null)}
	<div class="flex justify-between gap-[var(--space-4)] py-[var(--space-2)] text-sm">
		<dt class="text-[var(--ink-muted)]">{label}</dt>
		<dd class="text-right text-[var(--ink)]">{value ?? '—'}</dd>
	</div>
{/snippet}

<svelte:head>
	<title>{project.projectTag} · {project.name} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[{ label: m.nav_projects(), href: '/projects' }, { label: project.projectTag }]}
	/>

	<!--
		The living header (#91): the code, the name and — from server data, not
		from the tasks rendered below — how many tasks sit in each group.
	-->
	<PageHeader
		title={project.name}
		code={project.projectTag}
		codeViewTransitionName={toViewTransitionName('record', project.projectTag)}
	>
		{#snippet summary()}
			<span
				class="inline-flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)]"
			>
				{#if archived}
					<span class={badge({ tone: 'neutral', plain: true })}>{m.project_detail_archived()}</span>
				{/if}
				{#each STATE_GROUPS as group (group)}
					{#if data.progress.counts[group] > 0}
						<span>
							<RollingNumber value={data.progress.counts[group]} />
							{stateGroupLabel(group)}
						</span>
					{/if}
				{/each}
			</span>
		{/snippet}
		{#snippet actions()}
			{#if writable}
				<Button variant="secondary" onclick={openEdit}>
					<Pencil class="size-4" aria-hidden="true" />
					{m.project_detail_edit()}
				</Button>
				<Button onclick={() => openTask(null)}>
					<Plus class="size-4" aria-hidden="true" />
					{m.project_new_task()}
				</Button>
			{/if}
			{#if data.canManage}
				<form
					method="POST"
					action="?/{archived ? 'unarchive' : 'archive'}"
					use:optimisticEnhance={() => {
						const previous = archived;
						archived = !previous;
						return () => {
							archived = previous;
						};
					}}
				>
					<Button type="submit" variant="ghost">
						{#if archived}
							<ArchiveRestore class="size-4" aria-hidden="true" />
							{m.projects_unarchive()}
						{:else}
							<Archive class="size-4" aria-hidden="true" />
							{m.projects_archive()}
						{/if}
					</Button>
				</form>
			{/if}
		{/snippet}
	</PageHeader>

	{#if archived}
		<p class="mt-[var(--space-4)] text-sm text-[var(--ink-muted)]">
			{m.project_detail_archived_notice()}
		</p>
	{/if}

	<nav class="mt-[var(--space-6)] flex gap-[var(--space-1)]" aria-label={m.board_views_label()}>
		{#each views as option (option.id)}
			<a
				href={option.href}
				data-sveltekit-replacestate
				onclick={() => storeBoardPreference({ view: option.id as 'board' | 'list' })}
				aria-current={view === option.id ? 'page' : undefined}
				class="ut-transition-fast rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-1)] text-sm font-medium transition-colors {view ===
				option.id
					? 'bg-[var(--surface-2)] text-[var(--ink)]'
					: 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}"
			>
				{option.label}
			</a>
		{/each}
	</nav>

	{#if view === 'board'}
		<div class="mt-[var(--space-4)]" data-view="board">
			{#if boardLoading}
				<TaskBoardSkeleton columns={data.states.length} />
			{:else}
				<TaskBoard
					states={data.states}
					tasks={data.tasks}
					editable={writable}
					collapsedStates={data.collapsedStates}
					onquickcreate={openTask}
				/>
			{/if}
		</div>
	{:else}
		<div class="mt-[var(--space-4)] space-y-[var(--space-4)]" data-view="list">
			{#each columns as column (column.id)}
				<WorkPanel heading={column.name}>
					{#snippet actions()}
						<StatusBadge status={column.group} label={stateGroupLabel(column.group)} />
					{/snippet}
					<ul class="divide-y divide-[var(--border)]">
						{#each column.tasks as task (task.id)}
							<li
								class="flex flex-wrap items-center gap-x-[var(--space-4)] gap-y-[var(--space-1)] py-[var(--space-2)] text-sm"
							>
								<a
									href="/tasks/{encodeURIComponent(task.taskTag)}"
									class="font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
									style:view-transition-name={toViewTransitionName('record', task.taskTag)}
								>
									{task.taskTag}
								</a>
								<a
									href="/tasks/{encodeURIComponent(task.taskTag)}"
									class="min-w-0 flex-1 truncate font-medium text-[var(--ink)] hover:underline"
								>
									{task.title}
								</a>
								<span class="text-[var(--ink-muted)]">
									{task.assignees.length > 0
										? task.assignees.map((assignee) => assignee.fullName).join(', ')
										: m.project_detail_task_unassigned()}
								</span>
								{#if task.dueDate}
									<span class="text-[var(--ink-muted)] tabular-nums">{formatDay(task.dueDate)}</span
									>
								{/if}
							</li>
						{/each}
					</ul>
				</WorkPanel>
			{:else}
				<WorkPanel heading={m.project_detail_tasks()}>
					<p class="text-sm text-[var(--ink-muted)]">
						{data.canManage
							? m.project_detail_tasks_empty()
							: m.project_detail_tasks_empty_limited()}
					</p>
				</WorkPanel>
			{/each}
		</div>
	{/if}

	{#snippet side()}
		<WorkPanel heading={m.project_detail_details()}>
			<dl class="divide-y divide-[var(--border)]">
				{@render detail(m.project_detail_owner(), project.ownerName)}
				{@render detail(
					m.project_detail_due(),
					project.dueDate ? formatDay(project.dueDate) : null
				)}
			</dl>
			{#if project.description}
				<p class="mt-[var(--space-3)] text-sm whitespace-pre-wrap text-[var(--ink-muted)]">
					{project.description}
				</p>
			{/if}
		</WorkPanel>

		<WorkPanel heading={m.project_detail_progress()}>
			<ProjectProgress counts={data.progress.counts} />
		</WorkPanel>

		{#await data.timeline}
			<WorkPanel heading={m.timeline_title()}>
				<TimelineSkeleton />
			</WorkPanel>
		{:then entries}
			<WorkPanel heading={m.timeline_title()}>
				<AssetTimeline
					domain="project"
					items={entries.map((entry) => ({
						kind: 'activity' as const,
						id: entry.id,
						at: entry.occurredAt,
						entry
					}))}
				/>
			</WorkPanel>
		{/await}
	{/snippet}
</PageLayout>

{#if writable}
	<Sheet
		open={editOpen}
		onOpenChange={(next) => (editOpen = next)}
		pending={saving}
		title={m.project_edit_title({ tag: project.projectTag })}
		description={m.project_edit_lede()}
	>
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') {
						editOpen = false;
						const next = (result.data as { projectTag?: string } | undefined)?.projectTag;
						// The tag is the URL: follow it if it moved.
						if (next && next !== project.projectTag) {
							await goto(`/projects/${encodeURIComponent(next)}`, { replaceState: true });
						}
					}
				};
			}}
			class="flex h-full min-h-0 flex-col"
		>
			<div class="min-h-0 flex-1 space-y-[var(--space-5)] overflow-y-auto">
				<Field
					label={m.project_field_name()}
					name="name"
					required
					value={project.name}
					error={form && 'field' in form && form.field === 'name'
						? failureFor('update')
						: undefined}
				/>
				<TextAreaField
					label={m.project_field_description()}
					name="description"
					value={project.description}
				/>
				<SearchSelectField
					label={m.project_field_owner()}
					name="ownerPersonId"
					placeholder={m.project_field_owner_none()}
					options={ownerOptions}
					bind:value={ownerPersonId}
				/>
				<Field label={m.project_field_due()} name="dueDate" type="date" value={project.dueDate} />
				<Field
					label={m.project_field_tag()}
					name="projectTag"
					value={project.projectTag}
					error={form && 'field' in form && form.field === 'projectTag'
						? failureFor('update')
						: undefined}
				/>
				{#if form && 'action' in form && form.action === 'update' && !('field' in form && form.field)}
					{@render failure('update')}
				{/if}
			</div>

			<div
				class="mt-[var(--space-4)] flex shrink-0 items-center gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-4)]"
			>
				<Button type="submit" busy={saving}>
					{saving ? m.form_saving() : m.project_edit_submit()}
				</Button>
				<Button type="button" variant="ghost" onclick={() => (editOpen = false)}>
					{m.form_cancel()}
				</Button>
			</div>
		</form>
	</Sheet>

	<Dialog
		open={taskOpen}
		onOpenChange={(next) => (taskOpen = next)}
		pending={saving}
		title={m.project_new_task()}
		description={quickCreateState
			? m.board_quick_create_lede({ state: quickCreateState.name })
			: m.project_new_task_lede()}
	>
		<form
			method="POST"
			action="?/createTask"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update();
					saving = false;
					if (result.type === 'success') taskOpen = false;
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if taskStateId}<input type="hidden" name="stateId" value={taskStateId} />{/if}
			<Field
				label={m.task_field_title()}
				name="title"
				required
				autofocus
				error={failureFor('createTask')}
			/>
			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={() => (taskOpen = false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving}>{m.project_new_task_submit()}</Button>
			</div>
		</form>
	</Dialog>
{/if}
