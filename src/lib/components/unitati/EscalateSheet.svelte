<script lang="ts" module>
	import { tv } from '#lib/tv.js';

	/**
	 * The segmented choice: native radios (arrow keys, one tab stop and the form
	 * semantics come for free) drawn as a row of segments. The input is visually
	 * hidden but stays focusable, so the focus ring is drawn on its label.
	 */
	export const segmented = tv({
		slots: {
			root: 'flex flex-col gap-[var(--space-2)] border-0 p-0 m-0',
			legend: 'p-0 text-label text-[var(--ink)]',
			track: [
				'inline-flex w-fit max-w-full flex-wrap gap-[var(--space-1)] rounded-[var(--radius-md)]',
				'bg-[var(--surface-2)] p-[var(--space-1)]'
			],
			segment: [
				'cursor-pointer rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)]',
				'text-sm leading-5 font-medium text-[var(--ink-muted)] select-none',
				'peer-checked:bg-[var(--surface-1)] peer-checked:text-[var(--ink)] peer-checked:shadow-sm',
				'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--brand)]',
				'peer-disabled:cursor-not-allowed peer-disabled:opacity-45'
			]
		}
	});
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import Alert from './Alert.svelte';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import {
		consequence,
		escalationKind,
		initialTarget,
		isReady,
		pickedFrom,
		projectModesFor,
		submitLabel,
		successText,
		targetsFor,
		type EscalateTarget,
		type EscalationKind,
		type PickedRecord,
		type ProjectMode
	} from './escalation-form.js';
	import Field from './Field.svelte';
	import SearchSelectField from './SearchSelectField.svelte';
	import type { SelectOption } from './SelectField.svelte';
	import Sheet from './Sheet.svelte';
	import TextAreaField from './TextAreaField.svelte';

	interface Props {
		open: boolean;
		/** Called with `false` once the Sheet may close: after a discard confirmation, or a success. */
		onOpenChange: (open: boolean) => void;
		/** The ticket being escalated, as far as the sentences need it. */
		ticket: {
			tag: string;
			/** The status already worded, e.g. "En curso". */
			statusLabel: string;
			assigneeName: string | null;
		};
		/** What `escalationDraft` made of the ticket: the Sheet opens with these filled in. */
		draft: { title: string; description: string | null };
		/** The ticket's subject: what a new project starts out called. */
		projectName: string;
		/** `projects.manage`: without it the *nuevo* choices are not offered. */
		canCreate: boolean;
		people: SelectOption[];
		/** The actor's own person, the default owner of a new project. */
		defaultOwnerId: string | null;
		/**
		 * Where the pickers search: `{searchBase}/tasks`, `/projects` and
		 * `/linkable-projects`, each answering `?q=` with `{ value, label, disabled }`.
		 */
		searchBase: string;
		/**
		 * Where the Sheet opens, when not the first target on offer; and a failure
		 * to show on open. Both exist so the gallery can show each state by itself.
		 */
		startTarget?: { target: EscalateTarget; mode?: ProjectMode };
		startError?: string;
		/** The form action. */
		formAction?: string;
		class?: string;
	}

	let {
		open,
		onOpenChange,
		ticket,
		draft,
		projectName,
		canCreate,
		people,
		defaultOwnerId,
		searchBase,
		startTarget,
		startError,
		formAction = '?/escalate',
		class: className
	}: Props = $props();

	const styles = segmented();

	/* ------------------------------ form state ------------------------------ */

	let target: EscalateTarget = $state('existing_task');
	let projectMode: ProjectMode = $state('existing');

	let projectId: string | null = $state(null);
	let title = $state('');
	let description = $state('');
	let taskId: string | null = $state(null);
	let existingProjectId: string | null = $state(null);
	let name = $state('');
	let ownerId: string | null = $state(null);

	/** The options the user picked, for the button and the sentences. */
	let pickedProject: PickedRecord | null = $state(null);
	let pickedTask: PickedRecord | null = $state(null);
	let pickedExistingProject: PickedRecord | null = $state(null);

	let error: string | null = $state(null);
	/** The field the last refusal is about, if the server could name one. */
	let errorField: string | null = $state(null);
	const errorFor = (field: string) => (errorField === field ? (error ?? undefined) : undefined);
	let pending = $state(false);
	let confirmDiscard = $state(false);

	/** Every time the Sheet opens it starts from the ticket again, never from the last attempt. */
	function reset() {
		const offered = startTarget && targetsFor(canCreate).includes(startTarget.target);
		target = offered ? startTarget!.target : initialTarget(canCreate);
		projectMode =
			offered && startTarget!.mode && projectModesFor(canCreate).includes(startTarget!.mode)
				? startTarget!.mode
				: projectModesFor(canCreate)[0];
		projectId = null;
		title = draft.title;
		description = draft.description ?? '';
		taskId = null;
		existingProjectId = null;
		name = projectName;
		ownerId = defaultOwnerId;
		pickedProject = null;
		pickedTask = null;
		pickedExistingProject = null;
		error = startError ?? null;
		errorField = null;
		confirmDiscard = false;
	}

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) reset();
		wasOpen = open;
	});

	/* ------------------------------- derivations ----------------------------- */

	const kind: EscalationKind = $derived(escalationKind(target, projectMode));
	const targets = $derived(targetsFor(canCreate));
	const projectModes = $derived(projectModesFor(canCreate));

	const picked = $derived(
		kind === 'new_task'
			? pickedProject
			: kind === 'existing_task'
				? pickedTask
				: kind === 'existing_project'
					? pickedExistingProject
					: null
	);

	const ready = $derived(
		isReady(kind, { projectId, title, description, taskId, existingProjectId, name })
	);

	const lines = $derived(
		consequence({
			kind,
			picked,
			statusLabel: ticket.statusLabel,
			assigneeName: ticket.assigneeName
		})
	);

	/** Anything the user changed: closing then asks before throwing it away. */
	const dirty = $derived(
		projectId !== null ||
			taskId !== null ||
			existingProjectId !== null ||
			title !== draft.title ||
			description !== (draft.description ?? '') ||
			name !== projectName ||
			ownerId !== defaultOwnerId
	);

	const TARGET_LABELS: Record<EscalateTarget, () => string> = {
		new_task: m.escalate_target_new_task,
		existing_task: m.escalate_target_existing_task,
		project: m.escalate_target_project
	};
	const MODE_LABELS: Record<ProjectMode, () => string> = {
		new: m.escalate_project_new,
		existing: m.escalate_project_existing
	};

	/* --------------------------------- closing ------------------------------- */

	function requestClose(next: boolean) {
		if (next) return onOpenChange(true);
		if (pending) return;
		if (dirty) {
			confirmDiscard = true;
			return;
		}
		onOpenChange(false);
	}
</script>

{#snippet choice(
	label: string,
	group: string,
	values: readonly string[],
	words: Record<string, () => string>,
	current: string,
	choose: (value: string) => void
)}
	<fieldset class={styles.root()}>
		<legend class={styles.legend()}>{label}</legend>
		<div class={styles.track()}>
			{#each values as value (value)}
				<label class="relative flex">
					<input
						type="radio"
						class="peer sr-only"
						name={group}
						{value}
						checked={current === value}
						disabled={pending}
						onchange={() => choose(value)}
					/>
					<span class={styles.segment()}>{words[value]()}</span>
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

<Sheet
	{open}
	onOpenChange={requestClose}
	{pending}
	title={m.escalate_title({ tag: ticket.tag })}
	description={m.escalate_lede()}
	class={className}
	form={{
		action: formAction,
		method: 'POST',
		use: (node) =>
			enhance(node, () => {
				pending = true;
				error = null;
				errorField = null;
				return async ({ result, update }) => {
					pending = false;
					if (result.type === 'success') {
						const done = result.data?.escalated as { tag: string } | undefined;
						if (done) toast.success(successText(kind, done.tag));
						onOpenChange(false);
						// Reloads the ticket, so the relation panel shows what was just linked.
						await update({ reset: false });
						return;
					}
					error =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: m.error_generic();
					errorField =
						result.type === 'failure' && typeof result.data?.field === 'string'
							? result.data.field
							: null;
				};
			})
	}}
>
	{#snippet fields()}
		<input type="hidden" name="kind" value={kind} />

		{@render choice(
			m.escalate_target_label(),
			'escalate-target',
			targets,
			TARGET_LABELS,
			target,
			(value) => (target = value as EscalateTarget)
		)}

		{#if target === 'project' && projectModes.length > 1}
			{@render choice(
				m.escalate_project_mode_label(),
				'escalate-project-mode',
				projectModes,
				MODE_LABELS,
				projectMode,
				(value) => (projectMode = value as ProjectMode)
			)}
		{/if}

		{#if kind === 'new_task'}
			<SearchSelectField
				label={m.escalate_field_project()}
				name="projectId"
				required
				error={errorFor('projectId')}
				placeholder={m.escalate_pick_project()}
				searchUrl="{searchBase}/projects"
				bind:value={projectId}
				onpick={(option) => (pickedProject = option ? pickedFrom(option) : null)}
			/>
			<Field
				label={m.escalate_field_title()}
				name="title"
				required
				error={errorFor('title')}
				bind:value={title}
			/>
			<TextAreaField
				label={m.escalate_field_description()}
				name="description"
				rows={6}
				bind:value={description}
			/>
		{:else if kind === 'existing_task'}
			<SearchSelectField
				label={m.escalate_field_task()}
				name="taskId"
				required
				error={errorFor('taskId')}
				placeholder={m.escalate_pick_task()}
				searchUrl="{searchBase}/tasks"
				bind:value={taskId}
				onpick={(option) => (pickedTask = option ? pickedFrom(option) : null)}
			/>
		{:else if kind === 'existing_project'}
			<SearchSelectField
				label={m.escalate_field_project()}
				name="projectId"
				required
				error={errorFor('projectId')}
				placeholder={m.escalate_pick_project()}
				searchUrl="{searchBase}/linkable-projects"
				bind:value={existingProjectId}
				onpick={(option) => (pickedExistingProject = option ? pickedFrom(option) : null)}
			/>
		{:else}
			<Field
				label={m.escalate_field_name()}
				name="name"
				required
				error={errorFor('name')}
				bind:value={name}
			/>
			<SearchSelectField
				label={m.escalate_field_owner()}
				name="ownerPersonId"
				placeholder={m.escalate_pick_person()}
				options={people}
				bind:value={ownerId}
			/>
		{/if}

		<Alert tone="info">
			{#each lines as line (line)}
				<p>{line}</p>
			{/each}
		</Alert>

		{#if error && !errorField}
			<Alert tone="danger">{error}</Alert>
		{/if}
	{/snippet}
	{#snippet footer()}
		<div
			class="flex items-center gap-[var(--space-3)] border-t border-[var(--border)] pt-[var(--space-4)]"
		>
			<Button type="submit" busy={pending} disabled={!ready || pending}>
				{pending ? m.form_saving() : submitLabel(kind, picked)}
			</Button>
			<Button type="button" variant="ghost" disabled={pending} onclick={() => requestClose(false)}>
				{m.form_cancel()}
			</Button>
		</div>
	{/snippet}
</Sheet>

<ConfirmDialog
	open={confirmDiscard}
	onOpenChange={(next) => {
		if (!next) confirmDiscard = false;
	}}
	title={m.escalate_discard_title()}
	description={m.escalate_discard_ask()}
	confirmLabel={m.escalate_discard_confirm()}
	danger={false}
>
	{#snippet action(confirm)}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				confirmDiscard = false;
				onOpenChange(false);
			}}
		>
			{@render confirm()}
		</form>
	{/snippet}
</ConfirmDialog>
