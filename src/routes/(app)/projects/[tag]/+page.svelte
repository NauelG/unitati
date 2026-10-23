<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Archive from '@lucide/svelte/icons/archive';
	import Lock from '@lucide/svelte/icons/lock';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Plus from '@lucide/svelte/icons/plus';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import {
		readStoredBoardPreference,
		resolveView,
		storeBoardPreference
	} from '#lib/board-preference.js';
	import CommentsCard from '#lib/components/unitati/CommentsCard.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import EditableText from '#lib/components/unitati/EditableText.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import FollowControl from '#lib/components/unitati/FollowControl.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import SegmentedControl from '#lib/components/unitati/SegmentedControl.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import ProjectVisibilityPanel from '#lib/components/unitati/ProjectVisibilityPanel.svelte';
	import ProjectProgress from '#lib/components/unitati/ProjectProgress.svelte';
	import Tooltip from '#lib/components/unitati/Tooltip.svelte';
	import RecordAttachments from '#lib/components/unitati/RecordAttachments.svelte';
	import PageCitePanel from '#lib/components/unitati/PageCitePanel.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import RollingNumber from '#lib/components/unitati/RollingNumber.svelte';
	import StatusBadge, { badge } from '#lib/components/unitati/StatusBadge.svelte';
	import { stateGroupLabel } from '#lib/components/unitati/status.js';
	import TaskBoard from '#lib/components/unitati/TaskBoard.svelte';
	import TaskBoardSkeleton from '#lib/components/unitati/TaskBoardSkeleton.svelte';
	import DateField from '#lib/components/unitati/DateField.svelte';
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

	let taskOpen = $state(false);
	/** The column a quick create was opened from; `null` is the domain's default state. */
	let taskStateId = $state<string | null>(null);
	let saving = $state(false);

	/**
	 * In-place edits (#226) are optimistic: each field has a mirror that follows
	 * the record until the next load and is assigned on submit. Every edit posts
	 * only its own field to `?/update`, so no other field can be touched.
	 */
	let name = $derived(project.name);
	let projectTag = $derived(project.projectTag);
	let ownerPersonId = $derived(project.ownerPersonId);
	let dueDate = $derived(project.dueDate);

	const ownerOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);
	const ownerName = $derived(
		ownerPersonId === project.ownerPersonId
			? (project.ownerName ?? '')
			: (ownerOptions.find((option) => option.value === ownerPersonId)?.label ?? '')
	);

	/** A mirror write that remembers what it replaced: the rollback `optimisticEnhance` wants. */
	function mirror(read: () => string | null, write: (value: string | null) => void, field: string) {
		return (formData: FormData) => {
			const before = read();
			write(String(formData.get(field) ?? '') || null);
			return () => write(before);
		};
	}

	/** The code is the URL: a changed one is followed instead of reloading the old address. */
	async function followTag(result: Record<string, unknown> | undefined) {
		const next = result?.projectTag;
		if (typeof next !== 'string' || next === project.projectTag) return false;
		await goto(`/projects/${encodeURIComponent(next)}`, { replaceState: true });
		return true;
	}

	/** A field-keyed validation message from the last `update`, for the editor that owns that field. */
	const fieldError = (field: string) =>
		form && 'action' in form && form.action === 'update' && 'field' in form && form.field === field
			? failureFor('update')
			: undefined;

	let describing = $state(false);
	let descriptionDraft = $state('');

	function editDescription() {
		descriptionDraft = project.description ?? '';
		describing = true;
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

<svelte:head>
	<title>{documentTitle(project.projectTag, project.name)}</title>
</svelte:head>

{#snippet ownerRow()}
	<EditableDetailRow
		kind="select"
		label={m.project_detail_owner()}
		value={ownerPersonId}
		display={ownerName}
		options={ownerOptions}
		noneLabel={m.project_field_owner_none()}
		placeholder={m.project_field_owner_none()}
		action="?/update"
		name="ownerPersonId"
		editable={writable}
		optimistic={mirror(
			() => ownerPersonId,
			(value) => (ownerPersonId = value),
			'ownerPersonId'
		)}
	/>
{/snippet}
{#snippet dueRow()}
	<EditableDetailRow
		kind="custom"
		label={m.project_detail_due()}
		value={dueDate}
		display={dueDate ? formatDay(dueDate) : ''}
		placeholder="—"
		action="?/update"
		name="dueDate"
		editable={writable}
		optimistic={mirror(
			() => dueDate,
			(value) => (dueDate = value),
			'dueDate'
		)}
	>
		{#snippet editor({ value, commit })}
			<div class="p-[var(--space-3)]">
				<DateField label={m.project_field_due()} {value} onchange={(next) => commit(next ?? '')} />
			</div>
		{/snippet}
	</EditableDetailRow>
{/snippet}

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
		title={name}
		level="record"
		code={projectTag}
		codeViewTransitionName={toViewTransitionName('record', project.projectTag)}
	>
		{#snippet codeContent()}
			<EditableText
				value={projectTag}
				editable={writable}
				mono
				action="?/update"
				name="projectTag"
				label={m.project_field_tag()}
				optimistic={mirror(
					() => projectTag,
					(value) => (projectTag = value ?? projectTag),
					'projectTag'
				)}
				onsuccess={followTag}
				error={fieldError('projectTag')}
			/>
		{/snippet}
		{#snippet titleContent()}
			<EditableText
				value={name}
				editable={writable}
				action="?/update"
				name="name"
				label={m.project_field_name()}
				optimistic={mirror(
					() => name,
					(value) => (name = value ?? name),
					'name'
				)}
				error={fieldError('name')}
			/>
			{#if project.visibility === 'members'}
				<Tooltip content={m.project_visibility_locked()} side="bottom">
					{#snippet child({ props })}
						<span
							{...props}
							class="ml-[var(--space-2)] inline-flex align-middle text-[var(--ink-muted)]"
						>
							<Lock class="size-5" aria-label={m.project_visibility_locked()} />
						</span>
					{/snippet}
				</Tooltip>
			{/if}
		{/snippet}
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
				{#if data.openTickets > 0}
					<span>
						<RollingNumber value={data.openTickets} />
						{m.project_detail_open_tickets()}
					</span>
				{/if}
			</span>
		{/snippet}
		{#snippet actions()}
			<FollowControl follow={data.follow} />
			{#if writable}
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
		<Alert tone="info" class="mt-[var(--space-4)]">{m.project_detail_archived_notice()}</Alert>
	{/if}

	{#if writable || project.description}
		<WorkPanel heading={m.project_field_description()} class="mt-[var(--space-6)]">
			{#snippet actions()}
				{#if writable && !describing && project.description}
					<Button variant="ghost" onclick={editDescription}>{m.project_description_edit()}</Button>
				{/if}
			{/snippet}
			{#if describing}
				<form
					method="POST"
					action="?/update"
					class="space-y-[var(--space-3)]"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							saving = false;
							if (result.type === 'success') describing = false;
						};
					}}
				>
					<RichTextEditor
						name="description"
						label={m.project_field_description()}
						bind:value={descriptionDraft}
					/>
					{#if fieldError('description')}<FormError>{fieldError('description')}</FormError>{/if}
					<FormActions>
						<Button type="button" variant="ghost" onclick={() => (describing = false)}>
							{m.form_cancel()}
						</Button>
						<Button type="submit" busy={saving}>{m.project_description_save()}</Button>
					</FormActions>
				</form>
			{:else if project.description}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
				<div class={prose}>{@html data.descriptionHtml}</div>
			{:else}
				<Button variant="ghost" onclick={editDescription}>{m.project_description_add()}</Button>
			{/if}
		</WorkPanel>
	{/if}

	<SegmentedControl
		class="mt-[var(--space-6)]"
		aria-label={m.board_views_label()}
		options={views}
		value={view}
		onchange={(id) => storeBoardPreference({ view: id as 'board' | 'list' })}
	/>

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
									class="group flex min-w-0 flex-1 items-baseline gap-[var(--space-4)]"
								>
									<span
										class="text-record-id text-[var(--ink-muted)] group-hover:text-[var(--ink)]"
										translate="no"
										style:view-transition-name={toViewTransitionName('record', task.taskTag)}
									>
										{task.taskTag}
									</span>
									<span
										class="min-w-0 flex-1 truncate font-medium text-[var(--ink)] group-hover:underline"
									>
										{task.title}
									</span>
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
					<EmptyState
						description={data.canManage
							? m.project_detail_tasks_empty()
							: m.project_detail_tasks_empty_limited()}
						class="py-[var(--space-6)]"
					/>
				</WorkPanel>
			{/each}
		</div>
	{/if}

	<div class="mt-[var(--space-6)]">
		<CommentsCard
			id="comments"
			comments={data.comments}
			action="?/addComment"
			canComment={writable}
			error={failureFor('addComment')}
		/>
	</div>

	{#snippet side()}
		<WorkPanel heading={m.project_detail_details()}>
			<DescriptionList
				items={[
					{ label: m.project_detail_owner(), value: ownerRow },
					{ label: m.project_detail_due(), value: dueRow }
				]}
			/>
		</WorkPanel>

		<ProjectVisibilityPanel
			visibility={project.visibility}
			members={data.members}
			candidates={data.memberCandidates}
			editable={data.canEditMembers}
			errors={{
				setVisibility: failureFor('setVisibility'),
				addMember: failureFor('addMember'),
				removeMember: failureFor('removeMember')
			}}
		/>

		<WorkPanel heading={m.project_detail_progress()}>
			<ProjectProgress counts={data.progress.counts} />
		</WorkPanel>

		<RecordAttachments
			items={data.attachments}
			downloadBase="/project-attachments"
			canManage={writable}
			uploadError={failureFor('addAttachments')}
			removeError={failureFor('removeAttachment')}
		/>

		<RelationConstellation
			centre={{ kind: 'project', tag: project.projectTag }}
			groups={data.related}
		/>
		<RelatedRecords
			groups={data.related}
			unlinkActions={{
				...(data.canUnlink ? { ticket: '?/unlinkTicket' } : {}),
				...(data.canManage ? { page: '?/undocumentPage' } : {})
			}}
			unlinkable={['handles', 'documented_by']}
			error={failureFor('unlinkTicket') ?? failureFor('undocumentPage')}
		/>
		{#if writable}
			<PageCitePanel
				heading={m.project_docs_panel_title()}
				label={m.project_docs_add_field()}
				placeholder={m.project_docs_add_placeholder()}
				submitLabel={m.project_docs_add_submit()}
				action="?/documentPage"
				searchUrl="/knowledge/pages/pick?format=options"
				error={failureFor('documentPage')}
			/>
		{/if}

		{#await data.timeline}
			<WorkPanel heading={m.timeline_title()}>
				<TimelineSkeleton />
			</WorkPanel>
		{:then items}
			<WorkPanel heading={m.timeline_title()}>
				<AssetTimeline domain="project" {items} />
			</WorkPanel>
		{/await}
	{/snippet}
</PageLayout>

{#if writable}
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
			<FormActions>
				<Button type="button" variant="ghost" onclick={() => (taskOpen = false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" busy={saving}>{m.project_new_task_submit()}</Button>
			</FormActions>
		</form>
	</Dialog>
{/if}
