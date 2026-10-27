<script lang="ts" module>
	import type { StateGroup } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Tone } from './status.js';

	/** Derived on read from the dates and the tasks (ADR 0053); never stored. */
	type MilestoneStatus = 'completed' | 'overdue' | 'upcoming' | 'active';

	/** What a row needs; the page's `milestones` satisfies it as it is. */
	export interface MilestoneRow {
		id: string;
		name: string;
		description: string | null;
		descriptionHtml: string;
		startDate: string;
		targetDate: string;
		status: MilestoneStatus;
		progress: { counts: Record<StateGroup, number> };
	}

	/** A server refusal of one of the panel's actions, for the dialog that owns it. */
	export interface MilestoneFailure {
		action: string;
		message: string;
		field: string | null;
	}

	const STATUS: Record<MilestoneStatus, { tone: Tone; label: () => string }> = {
		upcoming: { tone: 'neutral', label: () => m.milestone_status_upcoming() },
		active: { tone: 'brand', label: () => m.milestone_status_active() },
		overdue: { tone: 'danger', label: () => m.milestone_status_overdue() },
		completed: { tone: 'success', label: () => m.milestone_status_completed() }
	};
</script>

<script lang="ts">
	import Flag from '@lucide/svelte/icons/flag';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { formatDay } from '#lib/format-date.js';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DateField from './DateField.svelte';
	import Dialog from './Dialog.svelte';
	import Field from './Field.svelte';
	import FormActions from './FormActions.svelte';
	import FormError from './FormError.svelte';
	import ProjectProgress from './ProjectProgress.svelte';
	import RichTextEditor from './RichTextEditor.svelte';
	import { badge } from './StatusBadge.svelte';
	import WorkPanel from './WorkPanel.svelte';

	interface Props {
		milestones: MilestoneRow[];
		/** Creating, editing and deleting: `projects.manage` on a project that is not archived. */
		editable: boolean;
		/** The `?milestone=` in force: an id, `none`, or `null` for the whole project. */
		filter: string | null;
		failure?: MilestoneFailure | null;
	}

	let { milestones, editable, filter, failure = null }: Props = $props();

	/** The current query string with `?milestone=` replaced (or dropped): `?view=` and the rest stay. */
	function filterHref(value: string): string {
		const params = new SvelteURLSearchParams(page.url.search);
		params.set('milestone', value);
		params.delete('timePage');
		return `?${params}`;
	}

	const failureOf = (...actions: string[]) =>
		failure && actions.includes(failure.action) ? failure : null;
	const fieldError = (field: string | null) => {
		const own = failureOf('createMilestone', 'updateMilestone');
		return own && own.field === field ? own.message : undefined;
	};

	let editing = $state<MilestoneRow | null>(null);
	let formOpen = $state(false);
	let saving = $state(false);
	let name = $state('');
	let startDate = $state<string | null>(null);
	let targetDate = $state<string | null>(null);
	let description = $state('');

	function openForm(milestone: MilestoneRow | null) {
		editing = milestone;
		name = milestone?.name ?? '';
		startDate = milestone?.startDate ?? null;
		targetDate = milestone?.targetDate ?? null;
		description = milestone?.description ?? '';
		formOpen = true;
	}

	let deleting = $state<MilestoneRow | null>(null);
	let removing = $state(false);
</script>

<WorkPanel heading={m.milestones_panel_title()} id="milestones" class="mt-[var(--space-6)]">
	{#snippet actions()}
		{#if editable}
			<Button variant="ghost" onclick={() => openForm(null)}>
				<Plus class="size-4" aria-hidden="true" />
				{m.milestone_new()}
			</Button>
		{/if}
	{/snippet}

	<ul class="m-0 list-none divide-y divide-[var(--border)] p-0" data-testid="milestones">
		{#each milestones as milestone (milestone.id)}
			{@const status = STATUS[milestone.status]}
			<li
				class="flex flex-wrap items-center gap-x-[var(--space-4)] gap-y-[var(--space-2)] py-[var(--space-3)] text-sm"
				data-milestone={milestone.id}
			>
				<a
					href={filterHref(milestone.id)}
					aria-label={m.milestone_filter_open({ name: milestone.name })}
					aria-current={filter === milestone.id ? 'true' : undefined}
					class="group flex min-w-0 flex-1 flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)]"
				>
					<span
						class="min-w-0 truncate font-medium text-[var(--ink)] group-hover:underline"
						class:underline={filter === milestone.id}
					>
						{milestone.name}
					</span>
					<span class="text-[var(--ink-muted)] tabular-nums">
						{m.milestone_range({
							start: formatDay(milestone.startDate),
							target: formatDay(milestone.targetDate)
						})}
					</span>
					<span class={badge({ tone: status.tone })} data-status={milestone.status}>
						{status.label()}
					</span>
				</a>
				<ProjectProgress counts={milestone.progress.counts} class="w-40 shrink-0" />
				{#if editable}
					<span class="flex shrink-0 items-center gap-[var(--space-1)]">
						<Button
							variant="ghost"
							size="sm"
							aria-label="{m.milestone_edit()}: {milestone.name}"
							onclick={() => openForm(milestone)}
						>
							<Pencil class="size-4" aria-hidden="true" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							aria-label="{m.milestone_delete()}: {milestone.name}"
							onclick={() => (deleting = milestone)}
						>
							<Trash2 class="size-4" aria-hidden="true" />
						</Button>
					</span>
				{/if}
				{#if milestone.descriptionHtml.trim() !== ''}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
					<div class="w-full text-[var(--ink-muted)]">{@html milestone.descriptionHtml}</div>
				{/if}
			</li>
		{:else}
			<li
				class="flex items-center gap-[var(--space-2)] py-[var(--space-3)] text-sm text-[var(--ink-muted)]"
			>
				<Flag class="size-4" aria-hidden="true" />
				{m.milestones_empty()}
			</li>
		{/each}
		{#if milestones.length > 0}
			<li class="py-[var(--space-3)] text-sm">
				<a
					href={filterHref('none')}
					aria-current={filter === 'none' ? 'true' : undefined}
					class="text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
					class:underline={filter === 'none'}
				>
					{m.milestone_none()}
				</a>
			</li>
		{/if}
	</ul>
	<FormError class="mt-[var(--space-2)]">{failureOf('deleteMilestone')?.message}</FormError>
</WorkPanel>

{#if editable}
	<Dialog
		open={formOpen}
		onOpenChange={(next) => (formOpen = next)}
		pending={saving}
		title={editing ? m.milestone_edit() : m.milestone_new()}
		description={editing ? m.milestone_dialog_edit_lede() : m.milestone_dialog_new_lede()}
	>
		<form
			method="POST"
			action={editing ? '?/updateMilestone' : '?/createMilestone'}
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					saving = false;
					if (result.type === 'success') formOpen = false;
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if editing}<input type="hidden" name="milestoneId" value={editing.id} />{/if}
			<Field
				label={m.milestone_field_name()}
				name="name"
				required
				autofocus
				bind:value={name}
				error={fieldError('name')}
			/>
			<div class="grid grid-cols-1 gap-[var(--space-3)] min-[28rem]:grid-cols-2 [&>*]:min-w-0">
				<DateField
					label={m.milestone_field_start()}
					name="startDate"
					required
					bind:value={startDate}
				/>
				<DateField
					label={m.milestone_field_target()}
					name="targetDate"
					required
					bind:value={targetDate}
					error={fieldError('dates')}
				/>
			</div>
			<RichTextEditor
				name="description"
				label={m.milestone_field_description()}
				bind:value={description}
			/>
			{#if fieldError('description')}<FormError>{fieldError('description')}</FormError>{/if}
			<FormError
				>{failureOf('createMilestone', 'updateMilestone')?.field === null
					? failure?.message
					: ''}</FormError
			>
			<FormActions>
				<Button type="button" variant="ghost" onclick={() => (formOpen = false)}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" busy={saving}>
					{editing ? m.milestone_save_submit() : m.milestone_create_submit()}
				</Button>
			</FormActions>
		</form>
	</Dialog>

	<ConfirmDialog
		open={deleting !== null}
		onOpenChange={(next) => {
			if (!next) deleting = null;
		}}
		pending={removing}
		title={deleting ? m.milestone_delete_title({ name: deleting.name }) : ''}
		description={m.milestone_delete_body()}
		confirmLabel={m.milestone_delete_submit()}
		error={failureOf('deleteMilestone')?.message}
	>
		{#snippet action(confirm)}
			<form
				method="POST"
				action="?/deleteMilestone"
				use:enhance={() => {
					removing = true;
					return async ({ result, update }) => {
						await update();
						removing = false;
						if (result.type === 'success') deleting = null;
					};
				}}
			>
				<input type="hidden" name="milestoneId" value={deleting?.id ?? ''} />
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}
