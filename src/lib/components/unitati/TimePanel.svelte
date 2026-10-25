<script lang="ts">
	import { enhance } from '$app/forms';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { decimalHours, formatMinutes } from '#lib/domain/time.js';
	import { m } from '#lib/paraglide/messages.js';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { confirmSubmit } from './confirm-submit.js';
	import DateField from './DateField.svelte';
	import Dialog from './Dialog.svelte';
	import Field from './Field.svelte';
	import FormError from './FormError.svelte';
	import SelectField from './SelectField.svelte';
	import TextAreaField from './TextAreaField.svelte';
	import WorkPanel from './WorkPanel.svelte';

	/**
	 * The **Time** section of a ticket's or task's side rail (ADR 0051): the
	 * record's total, its entries, and the form to log or correct one. Purely
	 * presentational: the page owns the `logTime`, `editTime` and `deleteTime`
	 * actions, and decides through `may` whether any control exists.
	 */
	export interface TimeEntryRow {
		id: string;
		personName: string;
		typeId: string;
		typeName: string;
		typeArchived: boolean;
		minutes: number;
		workDate: string;
		note: string | null;
		canChange: boolean;
	}

	interface Props {
		entries: TimeEntryRow[];
		totalMinutes: number;
		/** The types an entry may be put on: the organisation's active ones. */
		types: { id: string; name: string; isDefault: boolean }[];
		/** Whether the viewer may log time here (record state applied, ADR 0050). */
		canLog: boolean;
		/** A refusal of one of the three actions, placed in the open form. */
		error?: string | null;
		/** What the timer's stop prefills; opens the form on mount. */
		prefill?: { minutes: number; action?: string } | null;
	}

	let { entries, totalMinutes, types, canLog, error = null, prefill = null }: Props = $props();

	const defaultTypeId = $derived(types.find((type) => type.isDefault)?.id ?? types[0]?.id ?? null);

	let open = $state(false);
	let editing = $state<TimeEntryRow | null>(null);
	let duration = $state('');
	let workDate = $state<string | null>(null);
	let typeId = $state<string | null>(null);
	let note = $state('');
	let saving = $state(false);
	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	function today(): string {
		// The browser's own day: the server validates against the organisation's.
		const now = new Date();
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	}

	function openCreate(minutes?: number) {
		editing = null;
		duration = minutes ? formatMinutes(minutes) : '';
		workDate = today();
		typeId = defaultTypeId;
		note = '';
		open = true;
	}

	function openEdit(row: TimeEntryRow) {
		editing = row;
		duration = formatMinutes(row.minutes);
		workDate = row.workDate;
		typeId = row.typeId;
		note = row.note ?? '';
		open = true;
	}

	// Stopping a timer lands here with the elapsed time already typed in.
	let prefilled = false;
	$effect(() => {
		if (prefill && !prefilled) {
			prefilled = true;
			openCreate(prefill.minutes);
		}
	});

	const typeOptions = $derived.by(() => {
		const offered = types.map((type) => ({ value: type.id, label: type.name }));
		// An entry keeps the archived type it was logged on, so the form can still show it.
		return editing && editing.typeArchived
			? [...offered, { value: editing.typeId, label: editing.typeName }]
			: offered;
	});
</script>

<WorkPanel heading={m.time_panel_title()}>
	{#snippet actions()}
		{#if canLog}
			<Button size="sm" variant="secondary" onclick={() => openCreate()}>
				{m.time_panel_log()}
			</Button>
		{/if}
	{/snippet}

	<p class="m-0 text-sm text-[var(--ink-muted)]" data-testid="time-total">
		{m.time_panel_total({
			duration: formatMinutes(totalMinutes),
			hours: decimalHours(totalMinutes)
		})}
	</p>

	{#if entries.length === 0}
		<p class="mt-[var(--space-2)] mb-0 text-sm text-[var(--ink-muted)]">{m.time_panel_empty()}</p>
	{:else}
		<ul class="m-0 mt-[var(--space-3)] list-none space-y-[var(--space-3)] p-0">
			{#each entries as row (row.id)}
				<li class="text-sm">
					<div class="flex items-start justify-between gap-[var(--space-2)]">
						<div>
							<span class="font-medium text-[var(--ink)]">{formatMinutes(row.minutes)}</span>
							<span class="text-[var(--ink-muted)]">
								· {row.typeName}{row.typeArchived ? ` (${m.time_settings_archived()})` : ''}
							</span>
							<div class="text-[var(--ink-muted)]">{row.personName} · {row.workDate}</div>
						</div>
						{#if row.canChange}
							<div class="flex shrink-0 items-center gap-[var(--space-1)]">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									iconOnly
									title={m.catalogue_edit()}
									aria-label={m.time_panel_edit_entry({ duration: formatMinutes(row.minutes) })}
									onclick={() => openEdit(row)}
								>
									<PencilIcon class="size-4" aria-hidden="true" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									iconOnly
									class="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
									title={m.catalogue_delete()}
									aria-label={m.time_panel_delete_entry({ duration: formatMinutes(row.minutes) })}
									onclick={() => (confirmingId = row.id)}
								>
									<Trash2Icon class="size-4" aria-hidden="true" />
								</Button>
							</div>
						{/if}
					</div>
					{#if row.note}
						<p class="mt-[var(--space-1)] mb-0 whitespace-pre-line text-[var(--ink)]">{row.note}</p>
					{/if}

					<ConfirmDialog
						open={confirmingId === row.id}
						onOpenChange={(next) => {
							if (!next) confirmingId = null;
						}}
						title={m.time_panel_delete_title()}
						description={m.catalogue_delete_ask()}
						confirmLabel={m.catalogue_delete()}
						pending={pendingId === row.id}
					>
						{#snippet action(confirm)}
							<form
								method="POST"
								action="?/deleteTime"
								use:enhance={confirmSubmit({
									onPending: (pending) => (pendingId = pending ? row.id : null),
									onSettled: () => (confirmingId = null)
								})}
							>
								<input type="hidden" name="id" value={row.id} />
								{@render confirm()}
							</form>
						{/snippet}
					</ConfirmDialog>
				</li>
			{/each}
		</ul>
	{/if}
	{#if error && !open}
		<FormError>{error}</FormError>
	{/if}
</WorkPanel>

<Dialog
	{open}
	onOpenChange={(next) => (open = next)}
	title={editing ? m.time_panel_edit_title() : m.time_panel_log()}
>
	<form
		method="POST"
		action={editing ? '?/editTime' : (prefill?.action ?? '?/logTime')}
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = false;
				if (result.type === 'success') open = false;
			};
		}}
		class="space-y-[var(--space-4)]"
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<Field
			label={m.time_panel_duration()}
			name="duration"
			bind:value={duration}
			hint={m.time_panel_duration_hint()}
			autocomplete="off"
			required
		/>
		<DateField label={m.time_panel_date()} name="workDate" bind:value={workDate} required />
		<SelectField
			label={m.time_panel_type()}
			name="typeId"
			options={typeOptions}
			bind:value={typeId}
			required
		/>
		<TextAreaField label={m.time_panel_note()} name="note" bind:value={note} rows={3} />

		{#if error && open}
			<FormError>{error}</FormError>
		{/if}

		<div class="flex justify-end gap-[var(--space-2)]">
			<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
				{m.form_cancel()}
			</Button>
			<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
		</div>
	</form>
</Dialog>
