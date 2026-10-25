<script lang="ts">
	import { getLocalTimeZone, today } from '@internationalized/date';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import CommentsCard from '#lib/components/unitati/CommentsCard.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import FollowControl from '#lib/components/unitati/FollowControl.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';
	import EditableDetailRow from '#lib/components/unitati/EditableDetailRow.svelte';
	import EditableText from '#lib/components/unitati/EditableText.svelte';
	import MoveTaskDialog from '#lib/components/unitati/MoveTaskDialog.svelte';
	import { pageHeader } from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import RecordAttachments from '#lib/components/unitati/RecordAttachments.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import { stateGroupBadge } from '#lib/components/unitati/status.js';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import TimePanel from '#lib/components/unitati/TimePanel.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { Calendar } from '#lib/components/ui/calendar/index.js';
	import { parseIsoDate, toIsoDate } from '#lib/domain/calendar-date.js';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { formatDay } from '#lib/format-date.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { MOVE_TASK_EVENT, paletteContext } from '#lib/palette-context.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** A refusal of one of the Time section's actions, placed in its form. */
	const timeError = $derived(
		form && ['logTime', 'editTime', 'deleteTime'].includes(form.action) && 'message' in form
			? String(form.message)
			: null
	);

	const task = $derived(data.task);

	/**
	 * Optimistic mirrors (#89), resynced from the authoritative task whenever it
	 * changes. Each in-place field writes its mirror on submit and restores it on
	 * a refusal (ADR 0029).
	 */
	let title = $derived(data.task.title);
	let taskTag = $derived(data.task.taskTag);
	let stateId = $derived<string>(data.task.stateId);
	let dueDate = $derived<string | null>(data.task.dueDate);
	let assigneeIds = $derived(data.task.assignees.map((assignee) => assignee.personId));

	let moveOpen = $state(false);

	// The palette offers "mover tarea" only while this record can be moved, and
	// opens this same dialog (#120).
	$effect(() => {
		if (!data.may.moveToProject) return;
		paletteContext.movableTaskTag = data.task.taskTag;
		const open = () => (moveOpen = true);
		window.addEventListener(MOVE_TASK_EVENT, open);
		return () => {
			window.removeEventListener(MOVE_TASK_EVENT, open);
			paletteContext.movableTaskTag = null;
		};
	});

	// Readers get no catalogue from the server: the chip shows the current state alone.
	const stateOptions = $derived(
		(data.choices.states.length > 0
			? data.choices.states
			: [{ id: task.stateId, name: task.stateName, group: task.stateGroup }]
		).map((entry) => ({
			value: entry.id,
			label: entry.name,
			tone: stateGroupBadge(entry.group).tone
		}))
	);
	const personOptions = $derived(
		data.choices.people.map((person) => ({ value: person.id, label: person.fullName }))
	);
	// Names come from the catalogue when the viewer has it, else from the task itself.
	const nameOf = (id: string) =>
		data.choices.people.find((person) => person.id === id)?.fullName ??
		task.assignees.find((assignee) => assignee.personId === id)?.fullName ??
		id;
	const assigneeNames = $derived(assigneeIds.map(nameOf));

	const styles = pageHeader({ level: 'record' });

	/** A rename leaves the URL pointing at nothing: go to the new one instead of reloading the old. */
	async function followNewTag(result: Record<string, unknown> | undefined) {
		const next = result?.taskTag;
		if (typeof next !== 'string' || next === data.task.taskTag) return false;
		await goto(`/tasks/${encodeURIComponent(next)}`, { replaceState: true, invalidateAll: true });
		return true;
	}

	/** Mirror writer for a single-valued field: set it, hand back the way to undo. */
	function mirror<T>(get: () => T, set: (value: T) => void, read: (formData: FormData) => T) {
		return (formData: FormData) => {
			const before = get();
			set(read(formData));
			return () => set(before);
		};
	}

	let editingDescription = $state(false);
	let descriptionDraft = $state('');
	let savingDescription = $state(false);

	function editDescription() {
		descriptionDraft = task.description ?? '';
		editingDescription = true;
	}

	// A click on a link inside the rendered text follows the link; anywhere else opens the editor.
	function openFromProse(event: MouseEvent) {
		if (!(event.target as HTMLElement).closest('a')) editDescription();
	}

	const failureFor = (action: string) =>
		form && 'action' in form && form.action === action && 'message' in form
			? String(form.message)
			: undefined;
	const fieldError = (action: string, field: string) =>
		form && 'field' in form && form.field === field ? failureFor(action) : undefined;
</script>

{#snippet projectLink()}
	<a
		href="/projects/{encodeURIComponent(task.projectTag)}"
		class="text-[var(--ink)] hover:underline"
	>
		{task.projectTag} · {task.projectName}
	</a>
{/snippet}

{#snippet dueRow()}
	<EditableDetailRow
		kind="custom"
		label={m.task_detail_due()}
		value={dueDate}
		display={dueDate ? formatDay(dueDate) : ''}
		placeholder={m.task_detail_no_date()}
		action="?/update"
		name="dueDate"
		editable={data.may.edit}
		openOnHash="#action-due"
		optimistic={mirror(
			() => dueDate,
			(value) => (dueDate = value),
			(formData) => String(formData.get('dueDate')) || null
		)}
	>
		{#snippet editor({ value, commit })}
			<Calendar
				type="single"
				locale="es-ES"
				weekStartsOn={1}
				value={parseIsoDate(value)}
				onValueChange={(next) => next && commit(toIsoDate(next))}
			/>
			<div class="flex justify-between border-t border-[var(--border)] p-2">
				<button
					type="button"
					class="rounded-sm px-2 py-1 text-small text-[var(--brand)] hover:underline"
					onclick={() => commit(toIsoDate(today(getLocalTimeZone())))}
				>
					{m.date_field_today()}
				</button>
				<button
					type="button"
					class="rounded-sm px-2 py-1 text-small text-[var(--ink-muted)] hover:underline"
					onclick={() => commit('')}
				>
					{m.date_field_clear()}
				</button>
			</div>
		{/snippet}
	</EditableDetailRow>
{/snippet}

{#snippet assigneesRow()}
	<EditableDetailRow
		kind="multiselect"
		label={m.task_detail_assignees()}
		values={assigneeIds}
		display={assigneeNames.join(', ')}
		placeholder={m.task_detail_unassigned()}
		options={personOptions}
		action="?/setAssignees"
		name="personIds"
		editable={data.may.assign}
		openOnHash="#action-assignees"
		optimistic={mirror(
			() => assigneeIds,
			(value) => (assigneeIds = value),
			(formData) => formData.getAll('personIds').map(String)
		)}
	/>
{/snippet}

<svelte:head>
	<title>{documentTitle(task.taskTag, task.title)}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[
			{ label: m.nav_tasks(), href: '/tasks' },
			{ label: task.projectTag, href: `/projects/${encodeURIComponent(task.projectTag)}` },
			{ label: task.taskTag }
		]}
	/>

	<header class={styles.root()}>
		<div class={[styles.heading(), 'min-w-0 flex-1']}>
			<p
				class={styles.code()}
				translate="no"
				style:view-transition-name={toViewTransitionName('record', task.taskTag)}
			>
				<EditableText
					value={taskTag}
					editable={data.may.edit}
					action="?/update"
					name="taskTag"
					label={m.task_detail_code()}
					mono
					error={fieldError('update', 'taskTag')}
					optimistic={mirror(
						() => taskTag,
						(value) => (taskTag = value),
						(formData) => String(formData.get('taskTag'))
					)}
					onsuccess={followNewTag}
				/>
			</p>
			<EditableText
				level={1}
				class={styles.title({ class: 'mt-1' })}
				value={title}
				editable={data.may.edit}
				action="?/update"
				name="title"
				label={m.task_field_title()}
				error={fieldError('update', 'title')}
				optimistic={mirror(
					() => title,
					(value) => (title = value),
					(formData) => String(formData.get('title'))
				)}
			/>
			<div class="mt-[var(--space-2)]">
				<EditableChip
					value={stateId}
					options={stateOptions}
					action="?/changeState"
					name="stateId"
					label={m.task_detail_state()}
					editable={data.may.changeState}
					openOnHash="#action-state"
					optimistic={mirror(
						() => stateId,
						(value) => (stateId = value),
						(formData) => String(formData.get('stateId'))
					)}
				/>
			</div>
		</div>

		<div class={styles.actions()}>
			<FollowControl follow={data.follow} />
			{#if data.may.moveToProject}
				<Button variant="secondary" onclick={() => (moveOpen = true)}>
					<ArrowRightLeft class="size-4" aria-hidden="true" />
					{m.task_move_action()}
				</Button>
			{/if}
		</div>
	</header>

	{#if task.projectArchived}
		<p class="mt-[var(--space-4)] text-sm text-[var(--ink-muted)]">
			{m.task_detail_archived_notice()}
		</p>
	{/if}

	<div class="mt-[var(--space-6)]">
		<WorkPanel heading={m.task_field_description()}>
			{#if editingDescription}
				<form
					method="POST"
					action="?/update"
					class="space-y-[var(--space-3)]"
					use:enhance={() => {
						savingDescription = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							savingDescription = false;
							if (result.type === 'success') editingDescription = false;
						};
					}}
				>
					<RichTextEditor
						name="description"
						label={m.task_field_description()}
						bind:value={descriptionDraft}
					/>
					{#if fieldError('update', 'description')}
						<p role="alert" class="text-small text-[var(--danger)]">
							{fieldError('update', 'description')}
						</p>
					{/if}
					<div class="flex items-center gap-[var(--space-2)]">
						<Button type="submit" size="sm" busy={savingDescription}>
							{savingDescription ? m.form_saving() : m.task_detail_description_save()}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onclick={() => (editingDescription = false)}
						>
							{m.form_cancel()}
						</Button>
					</div>
				</form>
			{:else if task.description}
				{#if data.may.edit}
					<!-- The click is a pointer convenience; the button beside it is the keyboard path. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div class="group relative cursor-text" onclick={openFromProse}>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
						<div class={prose}>{@html data.descriptionHtml}</div>
						<button
							type="button"
							aria-label={m.task_field_description()}
							class="absolute top-0 right-0 rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--ink)] focus-visible:opacity-100"
							onclick={(event) => {
								event.stopPropagation();
								editDescription();
							}}
						>
							<Pencil class="size-4" aria-hidden="true" />
						</button>
					</div>
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
					<div class={prose}>{@html data.descriptionHtml}</div>
				{/if}
			{:else if data.may.edit}
				<button
					type="button"
					class="text-sm text-[var(--brand)] hover:underline"
					onclick={editDescription}
				>
					{m.task_detail_description_add()}
				</button>
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">{m.task_detail_description_none()}</p>
			{/if}
		</WorkPanel>
	</div>

	<div class="mt-[var(--space-6)]">
		<RecordAttachments
			items={data.attachments}
			downloadBase="/task-attachments"
			canManage={data.may.attach}
			uploadError={failureFor('addAttachments')}
			removeError={failureFor('removeAttachment')}
		/>
	</div>

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
		<WorkPanel heading={m.task_detail_details()}>
			<DescriptionList
				items={[
					{ label: m.task_detail_project(), value: projectLink },
					{ label: m.task_detail_due(), value: dueRow },
					{ label: m.task_detail_assignees(), value: assigneesRow }
				]}
			/>
		</WorkPanel>

		{#if data.time}
			<TimePanel
				entries={data.time.entries}
				totalMinutes={data.time.totalMinutes}
				types={data.time.types}
				canLog={data.time.canLog}
				error={timeError}
			/>
		{/if}

		<!-- Streamed (#89): the history and the tickets linked to this task are read
		     together, because the timeline merges both. -->
		{#await data.rail}
			<WorkPanel heading={m.timeline_title()}>
				<TimelineSkeleton />
			</WorkPanel>
		{:then rail}
			<RelationConstellation centre={{ kind: 'task', tag: task.taskTag }} groups={rail.related} />
			<RelatedRecords
				groups={rail.related}
				unlinkAction={data.may.unlinkTicket ? '?/unlinkTicket' : undefined}
				error={failureFor('unlinkTicket')}
			/>
			<WorkPanel heading={m.timeline_title()}>
				<AssetTimeline domain="project" items={rail.timeline} />
			</WorkPanel>
		{/await}
	{/snippet}
</PageLayout>

{#if data.may.moveToProject}
	<MoveTaskDialog
		open={moveOpen}
		onOpenChange={(next) => (moveOpen = next)}
		task={{ taskTag: task.taskTag, projectId: task.projectId }}
		projects={data.choices.projects}
	/>
{/if}
