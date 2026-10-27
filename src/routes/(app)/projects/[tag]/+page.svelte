<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Archive from '@lucide/svelte/icons/archive';
	import Lock from '@lucide/svelte/icons/lock';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Plus from '@lucide/svelte/icons/plus';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
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
	import MilestonesPanel from '#lib/components/unitati/MilestonesPanel.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import X from '@lucide/svelte/icons/x';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import SegmentedControl from '#lib/components/unitati/SegmentedControl.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
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
	import { taskHref } from '#lib/domain/routes.js';
	import { decimalHours, formatMinutes } from '#lib/domain/time.js';
	import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
	import { formatDay } from '#lib/format-date.js';
	import { keymapRegistry } from '#lib/keymap.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const project = $derived(data.project);

	/** A page of the rail's time entries: the rest of the query string (`?view=`) kept, the panel scrolled to. */
	function timePageHref(next: number): string {
		const params = new SvelteURLSearchParams(page.url.search);
		params.set('timePage', String(next));
		return `?${params}#project-time`;
	}

	/**
	 * Archiving is optimistic and needs no confirmation: both directions are
	 * reversible (#89). The mirror flips on submit and rolls back on a refusal. It
	 * decides what is shown (the badge, the notice, the button's label); whether a
	 * control exists is `data.may`, which the reload after the post brings (ADR 0050).
	 */
	let archived = $derived(data.project.archivedAt !== null);

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
		data.choices.people.map((person) => ({ value: person.id, label: person.fullName }))
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

	/** The create-task dialog's milestone: the one the board is filtered by, never `none`. */
	let taskMilestoneId = $state<string | null>(null);

	function openTask(stateId: string | null) {
		taskStateId = stateId;
		taskMilestoneId =
			data.milestoneFilter && data.milestoneFilter !== 'none' ? data.milestoneFilter : null;
		taskOpen = true;
	}

	const milestoneOptions = $derived(
		data.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name }))
	);
	const filteredMilestone = $derived.by(() => {
		if (data.milestoneFilter === null) return null;
		if (data.milestoneFilter === 'none') return { name: m.milestone_none() };
		// An id that is not (or no longer) a milestone of this project still gets a chip to clear.
		return (
			data.milestones.find((milestone) => milestone.id === data.milestoneFilter) ?? {
				name: m.milestone_unknown()
			}
		);
	});
	/** A refusal of the milestone panel's actions, for the dialog that owns it. */
	const milestoneFailure = $derived(
		form &&
			'action' in form &&
			['createMilestone', 'updateMilestone', 'deleteMilestone'].includes(String(form.action)) &&
			'message' in form
			? {
					action: String(form.action),
					message: String(form.message),
					field: (form.field ?? null) as string | null
				}
			: null
	);
	/** The query string without `?milestone=`: the other parameters (`?view=`) stay. */
	const clearFilterHref = $derived.by(() => {
		const params = new SvelteURLSearchParams(page.url.search);
		params.delete('milestone');
		const rest = params.toString();
		return rest ? `?${rest}` : page.url.pathname;
	});

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
			when: () => data.may.createTask,
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
		editable={data.may.edit}
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
		editable={data.may.edit}
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
				editable={data.may.edit}
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
				editable={data.may.edit}
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
			{#if data.may.createTask}
				<Button onclick={() => openTask(null)}>
					<Plus class="size-4" aria-hidden="true" />
					{m.project_new_task()}
				</Button>
			{/if}
			{#if data.may.archive || data.may.unarchive}
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

	{#if data.may.edit || project.description}
		<WorkPanel heading={m.project_field_description()} class="mt-[var(--space-6)]">
			{#snippet actions()}
				{#if data.may.edit && !describing && project.description}
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

	{#if data.milestones.length > 0 || data.may.manageMilestones}
		<MilestonesPanel
			milestones={data.milestones}
			editable={data.may.manageMilestones}
			filter={data.milestoneFilter}
			failure={milestoneFailure}
		/>
	{/if}

	<div class="mt-[var(--space-6)] flex flex-wrap items-center gap-[var(--space-3)]">
		<SegmentedControl
			aria-label={m.board_views_label()}
			options={views}
			value={view}
			onchange={(id) => storeBoardPreference({ view: id as 'board' | 'list' })}
		/>
		{#if filteredMilestone}
			<a
				href={clearFilterHref}
				class="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-full)] bg-[var(--brand-soft)] px-[var(--space-3)] py-[var(--space-1)] text-sm text-[var(--brand)] hover:underline"
				aria-label={m.milestone_filter_clear()}
				data-testid="milestone-filter-chip"
			>
				{m.milestone_filter_chip({ name: filteredMilestone.name })}
				<X class="size-3.5" aria-hidden="true" />
			</a>
		{/if}
	</div>

	{#if view === 'board'}
		<div class="mt-[var(--space-4)]" data-view="board">
			{#if boardLoading}
				<TaskBoardSkeleton columns={data.states.length} />
			{:else}
				<TaskBoard
					states={data.states}
					tasks={data.tasks}
					editable={data.may.moveTask}
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
								{#if task.milestoneName}
									<span class="text-[var(--ink-muted)]" data-milestone-name>
										{task.milestoneName}
									</span>
								{/if}
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
						description={data.scope === 'all'
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
			canComment={data.may.comment}
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
			candidates={data.choices.memberCandidates}
			editable={data.may.editMembers}
			errors={{
				setVisibility: failureFor('setVisibility'),
				addMember: failureFor('addMember'),
				removeMember: failureFor('removeMember')
			}}
		/>

		<WorkPanel heading={m.project_detail_progress()}>
			<ProjectProgress counts={data.progress.counts} />
		</WorkPanel>

		{#if data.time}
			<WorkPanel id="project-time" heading={m.time_panel_title()}>
				{#snippet actions()}
					{#if data.may.openTimeReport}
						<a
							class="text-sm text-[var(--brand)] hover:underline"
							href="/time?project={encodeURIComponent(project.projectTag)}"
							data-testid="project-time-report">{m.time_project_open_report()}</a
						>
					{/if}
				{/snippet}
				<p class="m-0 text-sm text-[var(--ink-muted)]" data-testid="project-time-total">
					{m.time_panel_total({
						duration: formatMinutes(data.time.totalMinutes),
						hours: decimalHours(data.time.totalMinutes)
					})}
				</p>
				{#if data.time.byType.length === 0}
					<p class="mt-[var(--space-2)] mb-0 text-sm text-[var(--ink-muted)]">
						{m.time_project_empty()}
					</p>
				{:else}
					<ul class="m-0 mt-[var(--space-3)] list-none space-y-[var(--space-1)] p-0 text-sm">
						{#each data.time.byType as row (row.typeId)}
							<li class="flex justify-between gap-[var(--space-2)]">
								<span class="text-[var(--ink)]">{row.typeName}</span>
								<span class="text-[var(--ink-muted)] tabular-nums">
									{formatMinutes(row.minutes)}
								</span>
							</li>
						{/each}
					</ul>

					<h3 class="mt-[var(--space-4)] mb-0 text-xs font-semibold text-[var(--ink-muted)]">
						{m.time_project_entries()}
					</h3>
					<ul
						class="m-0 mt-[var(--space-2)] list-none divide-y divide-[var(--border)] p-0 text-sm"
						data-testid="project-time-entries"
					>
						{#each data.time.entries.rows as entry (entry.id)}
							<li class="py-[var(--space-2)]">
								<div class="flex items-baseline justify-between gap-[var(--space-2)]">
									<a class="group min-w-0 truncate" href={taskHref(entry.record.tag)}>
										<span class="text-record-id text-[var(--ink-muted)]" translate="no">
											{entry.record.tag}
										</span>
										{#if entry.record.title !== null}
											<span class="text-[var(--ink)] group-hover:underline">
												{entry.record.title}
											</span>
										{/if}
									</a>
									<span class="shrink-0 text-[var(--ink)] tabular-nums">
										{formatMinutes(entry.minutes)}
									</span>
								</div>
								<p class="m-0 text-xs text-[var(--ink-muted)]">
									<span class="tabular-nums">{formatDay(entry.workDate)}</span>
									· {entry.personName} · {entry.typeName}
								</p>
								{#if entry.note}
									<p class="m-0 mt-[var(--space-1)] text-xs whitespace-pre-line text-[var(--ink)]">
										{entry.note}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
					{#if data.time.entries.pageCount > 1}
						<Pager
							class="mt-[var(--space-2)]"
							page={data.time.entries.page}
							pageCount={data.time.entries.pageCount}
							perPage={data.time.entries.perPage}
							total={data.time.entries.total}
							href={timePageHref}
						/>
					{/if}
				{/if}
			</WorkPanel>
		{/if}

		<RecordAttachments
			items={data.attachments}
			downloadBase="/project-attachments"
			canManage={data.may.attach}
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
				...(data.may.unlinkTicket ? { ticket: '?/unlinkTicket' } : {}),
				...(data.may.undocumentPage ? { page: '?/undocumentPage' } : {})
			}}
			unlinkable={['handles', 'documented_by']}
			error={failureFor('unlinkTicket') ?? failureFor('undocumentPage')}
		/>
		{#if data.may.documentPage}
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

{#if data.may.createTask}
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
			{#if milestoneOptions.length > 0}
				<SelectField
					label={m.milestone_field()}
					name="milestoneId"
					options={milestoneOptions}
					placeholder={m.milestone_none_option()}
					bind:value={taskMilestoneId}
				/>
			{/if}
			<FormActions>
				<Button type="button" variant="ghost" onclick={() => (taskOpen = false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" busy={saving}>{m.project_new_task_submit()}</Button>
			</FormActions>
		</form>
	</Dialog>
{/if}
