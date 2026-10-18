<script lang="ts">
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import MoveTaskDialog from '#lib/components/unitati/MoveTaskDialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import SearchSelectField from '#lib/components/unitati/SearchSelectField.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import Sheet from '#lib/components/unitati/Sheet.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import TimelineSkeleton from '#lib/components/unitati/TimelineSkeleton.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { formatDay } from '#lib/format-date.js';
	import { toViewTransitionName } from '#lib/motion.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import { MOVE_TASK_EVENT, paletteContext } from '#lib/palette-context.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const task = $derived(data.task);

	/**
	 * Optimistic mirrors (#89), resynced from the authoritative task whenever it
	 * changes. The state flips on submit and rolls back on a refusal; so do the
	 * assignees' names.
	 */
	let current = $derived({ name: data.task.stateName, group: data.task.stateGroup });
	let assigneeNames = $derived(data.task.assignees.map((assignee) => assignee.fullName));
	let assigneeIds = $derived(data.task.assignees.map((assignee) => assignee.personId));

	/**
	 * The state select submits as soon as a state is picked: choosing it *is* the
	 * act. The effect only fires on a difference between the pick and the stored
	 * state, so neither the settled save nor a rollback (which restores the pick)
	 * submits again.
	 */
	let stateForm = $state<HTMLFormElement>();
	let chosenStateId = $derived<string | null>(data.task.stateId);
	$effect(() => {
		if (chosenStateId !== data.task.stateId) void tick().then(() => stateForm?.requestSubmit());
	});

	let editOpen = $state(false);
	let moveOpen = $state(false);

	// The palette offers "mover tarea" only while this record can be moved, and
	// opens this same dialog (#120).
	$effect(() => {
		if (!data.canManage) return;
		paletteContext.movableTaskTag = data.task.taskTag;
		const open = () => (moveOpen = true);
		window.addEventListener(MOVE_TASK_EVENT, open);
		return () => {
			window.removeEventListener(MOVE_TASK_EVENT, open);
			paletteContext.movableTaskTag = null;
		};
	});
	let saving = $state(false);

	const stateOptions = $derived(
		data.states.map((entry) => ({ value: entry.id, label: entry.name }))
	);
	const personOptions = $derived(
		data.people.map((person) => ({ value: person.id, label: person.fullName }))
	);

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

	<PageHeader
		title={task.title}
		code={task.taskTag}
		codeViewTransitionName={toViewTransitionName('record', task.taskTag)}
	>
		{#snippet actions()}
			{#if data.canManage}
				<Button variant="secondary" onclick={() => (editOpen = true)}>
					<Pencil class="size-4" aria-hidden="true" />
					{m.task_detail_edit()}
				</Button>
				<Button variant="secondary" onclick={() => (moveOpen = true)}>
					<ArrowRightLeft class="size-4" aria-hidden="true" />
					{m.task_move_action()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mt-[var(--space-2)]">
		<StatusBadge status={current.group} label={current.name} />
	</div>

	{#if task.projectArchived}
		<p class="mt-[var(--space-4)] text-sm text-[var(--ink-muted)]">
			{m.task_detail_archived_notice()}
		</p>
	{/if}

	<div class="mt-[var(--space-6)]">
		<WorkPanel heading={m.task_field_description()}>
			{#if task.description}
				<p class="text-sm whitespace-pre-wrap text-[var(--ink)]">{task.description}</p>
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">{m.task_detail_description_none()}</p>
			{/if}
		</WorkPanel>
	</div>

	{#snippet side()}
		<WorkPanel heading={m.task_detail_details()}>
			<DescriptionList
				items={[
					{ label: m.task_detail_project(), value: projectLink },
					{ label: m.task_detail_due(), value: task.dueDate ? formatDay(task.dueDate) : null },
					...(data.canManage
						? []
						: [
								{ label: m.task_detail_state(), value: current.name },
								{
									label: m.task_detail_assignees(),
									value:
										assigneeNames.length > 0 ? assigneeNames.join(', ') : m.task_detail_unassigned()
								}
							])
				]}
			/>
		</WorkPanel>

		{#if data.canManage}
			<WorkPanel heading={m.task_detail_state()}>
				<form
					method="POST"
					action="?/changeState"
					bind:this={stateForm}
					class="space-y-[var(--space-3)]"
					use:optimisticEnhance={(formData) => {
						const next = data.states.find((entry) => entry.id === formData.get('stateId'));
						const previous = current;
						if (next) current = { name: next.name, group: next.group };
						return () => {
							current = previous;
							chosenStateId = data.task.stateId;
						};
					}}
				>
					<SelectField
						label={m.task_detail_state()}
						name="stateId"
						options={stateOptions}
						bind:value={chosenStateId}
						error={failureFor('changeState')}
					/>
				</form>
			</WorkPanel>

			<WorkPanel heading={m.task_detail_assignees()}>
				<form
					method="POST"
					action="?/setAssignees"
					class="space-y-[var(--space-3)]"
					use:optimisticEnhance={(formData) => {
						const ids = formData.getAll('personIds').map(String);
						const previousIds = assigneeIds;
						const previousNames = assigneeNames;
						assigneeIds = ids;
						assigneeNames = ids.map(
							(id) => data.people.find((person) => person.id === id)?.fullName ?? id
						);
						return () => {
							assigneeIds = previousIds;
							assigneeNames = previousNames;
						};
					}}
				>
					<SearchSelectField
						label={m.task_detail_assignees()}
						name="personIds"
						placeholder={m.task_assignees_placeholder()}
						options={personOptions}
						multiple
						bind:values={assigneeIds}
						error={failureFor('setAssignees')}
					/>
					<Button type="submit" variant="secondary" size="sm">{m.task_assignees_save()}</Button>
				</form>
			</WorkPanel>
		{/if}

		<!-- Streamed (#89): the history and the tickets linked to this task are read
		     together, because the timeline merges both. -->
		{#await data.timelineRail}
			<WorkPanel heading={m.timeline_title()}>
				<TimelineSkeleton />
			</WorkPanel>
		{:then rail}
			<RelationConstellation centre={{ kind: 'task', tag: task.taskTag }} groups={rail.related} />
			<RelatedRecords
				groups={rail.related}
				unlinkAction={data.canUnlink ? '?/unlinkTicket' : undefined}
				error={failureFor('unlinkTicket')}
			/>
			<WorkPanel heading={m.timeline_title()}>
				<AssetTimeline domain="project" items={rail.timeline} />
			</WorkPanel>
		{/await}
	{/snippet}
</PageLayout>

{#if data.canManage}
	<MoveTaskDialog
		open={moveOpen}
		onOpenChange={(next) => (moveOpen = next)}
		task={{ taskTag: task.taskTag, projectId: task.projectId }}
		projects={data.projects}
	/>

	<Sheet
		open={editOpen}
		onOpenChange={(next) => (editOpen = next)}
		pending={saving}
		title={m.task_edit_title({ tag: task.taskTag })}
		description={m.task_edit_lede()}
	>
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') editOpen = false;
				};
			}}
			class="flex h-full min-h-0 flex-col"
		>
			<div class="min-h-0 flex-1 space-y-[var(--space-5)] overflow-y-auto">
				<Field
					label={m.task_field_title()}
					name="title"
					required
					value={task.title}
					error={fieldError('update', 'title')}
				/>
				<TextAreaField
					label={m.task_field_description()}
					name="description"
					value={task.description}
				/>
				<Field label={m.task_field_due()} name="dueDate" type="date" value={task.dueDate} />
			</div>

			<div
				class="mt-[var(--space-4)] flex shrink-0 items-center gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-4)]"
			>
				<Button type="submit" busy={saving}>
					{saving ? m.form_saving() : m.task_edit_submit()}
				</Button>
				<Button type="button" variant="ghost" onclick={() => (editOpen = false)}>
					{m.form_cancel()}
				</Button>
			</div>
		</form>
	</Sheet>
{/if}
