<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import { catalogueDialog } from '#lib/components/unitati/catalogue-dialog.svelte.js';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { stateGroupBadge } from '#lib/components/unitati/status.js';
	import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import { optimisticEnhance } from '#lib/optimistic.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	interface Row {
		id: string;
		name: string;
		group: StateGroup;
		taskCount: number;
	}

	/**
	 * Optimistic mirror (#89): a reorder moves the row at once and `optimisticEnhance`
	 * puts it back if the server refuses. Reassigning a writable `$derived` holds
	 * the local order until `data.states` next changes (the reconciled load).
	 */
	let rows = $derived<Row[]>(data.states);

	const groupOptions = STATE_GROUPS.map((group) => ({
		value: group,
		label: stateGroupBadge(group).label
	}));

	// Same input styling as `Field`, without its label: this dialog's only text
	// input is labelled by the dialog itself (ADR 0020, as `service-desk/queues`).
	const input = field().input();

	const dialog = catalogueDialog<Row>({ createAction: 'create', editAction: 'rename' });
	let draftName = $state('');
	let draftGroup = $state<string | null>(STATE_GROUPS[0]);

	function openCreate() {
		draftName = '';
		draftGroup = STATE_GROUPS[0];
		dialog.openCreate();
	}

	function openEdit(row: Row) {
		draftName = row.name;
		draftGroup = row.group;
		dialog.openEdit(row);
	}

	const dialogFailure = $derived(dialog.failureFrom(form));
	/** `busy`, not optimistic: the dialog stays open to show `dialogFailure` on a refusal. */
	let saving = $state(false);

	/** The state asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	/** The refusal stays on the page, as an `Alert`, after the dialog closes. */
	const deleteFailure = $derived(form?.action === 'delete' ? form.message : null);

	/** Moves `id` one step inside its own group; a boundary is a no-op. */
	function move(list: Row[], id: string, direction: 'up' | 'down'): Row[] {
		const row = list.find((candidate) => candidate.id === id);
		if (!row) return list;
		const siblings = list.filter((candidate) => candidate.group === row.group);
		const from = siblings.indexOf(row);
		const to = direction === 'up' ? from - 1 : from + 1;
		if (to < 0 || to >= siblings.length) return list;
		const reordered = [...siblings];
		reordered.splice(from, 1);
		reordered.splice(to, 0, row);
		return STATE_GROUPS.flatMap((group) =>
			group === row.group ? reordered : list.filter((candidate) => candidate.group === group)
		);
	}

	function isFirst(row: Row): boolean {
		return rows.find((candidate) => candidate.group === row.group)?.id === row.id;
	}

	function isLast(row: Row): boolean {
		return rows.findLast((candidate) => candidate.group === row.group)?.id === row.id;
	}

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-middle';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
</script>

<svelte:head>
	<title>{m.project_states_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.project_states_title()}>
		{#snippet summary()}{m.project_states_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>{m.project_states_create()}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if rows.length === 0}
			<EmptyState description={m.project_states_empty()} />
		{:else}
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr>
						<th scope="col" class={head}>{m.project_states_name()}</th>
						<th scope="col" class={head}>{m.project_states_group()}</th>
						<th scope="col" class="{head} text-right">{m.project_states_tasks()}</th>
						<th scope="col" class={head}>{m.project_states_order()}</th>
						<th scope="col" class="{head} text-right">{m.project_states_actions()}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--border)]">
					{#each rows as row (row.id)}
						<tr>
							<th scope="row" class="{cell} text-left font-medium text-[var(--ink)]">
								{row.name}
							</th>
							<td class={cell}><StatusBadge status={row.group} /></td>
							<td class="{cell} text-right font-mono text-[var(--ink-muted)] tabular-nums">
								{row.taskCount}
							</td>
							<td class={cell}>
								<div class="flex items-center gap-[var(--space-1)]">
									{#each ['up', 'down'] as const as direction (direction)}
										<form
											method="POST"
											action="?/reorder"
											use:optimisticEnhance={() => {
												const previous = rows;
												rows = move(rows, row.id, direction);
												return () => (rows = previous);
											}}
										>
											<input type="hidden" name="id" value={row.id} />
											<input type="hidden" name="direction" value={direction} />
											<Button
												type="submit"
												variant="ghost"
												iconOnly
												size="sm"
												disabled={direction === 'up' ? isFirst(row) : isLast(row)}
												aria-label={direction === 'up'
													? m.project_states_move_up({ name: row.name })
													: m.project_states_move_down({ name: row.name })}
											>
												{#if direction === 'up'}
													<ArrowUpIcon class="size-4" aria-hidden="true" />
												{:else}
													<ArrowDownIcon class="size-4" aria-hidden="true" />
												{/if}
											</Button>
										</form>
									{/each}
								</div>
							</td>
							<td class={cell}>
								<div class="flex items-center justify-end gap-[var(--space-2)]">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										iconOnly
										title={m.catalogue_edit()}
										aria-label={m.catalogue_edit_title({ name: row.name })}
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
										aria-label={m.catalogue_delete_title({ name: row.name })}
										onclick={() => (confirmingId = row.id)}
									>
										<Trash2Icon class="size-4" aria-hidden="true" />
									</Button>
								</div>

								<ConfirmDialog
									open={confirmingId === row.id}
									onOpenChange={(next) => {
										if (!next) confirmingId = null;
									}}
									title={m.catalogue_delete_title({ name: row.name })}
									description={m.catalogue_delete_ask()}
									confirmLabel={m.catalogue_delete()}
									pending={pendingId === row.id}
								>
									{#snippet action(confirm)}
										<form
											method="POST"
											action="?/delete"
											use:enhance={confirmSubmit({
												onPending: (pending) => (pendingId = pending ? row.id : null),
												// Closed on a refusal too: the reason is the page's `Alert`.
												onSettled: () => (confirmingId = null)
											})}
										>
											<input type="hidden" name="id" value={row.id} />
											{@render confirm()}
										</form>
									{/snippet}
								</ConfirmDialog>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<Dialog
		open={dialog.open}
		onOpenChange={(next) => {
			if (!next) dialog.close();
		}}
		title={dialog.editingId
			? m.project_states_rename_title({ name: dialog.editing?.name ?? draftName })
			: m.project_states_create()}
	>
		<form
			method="POST"
			action={dialog.editingId ? '?/rename' : '?/create'}
			use:enhance={() => {
				saving = true;
				return async ({ result: submitResult, update }) => {
					await update();
					saving = false;
					if (submitResult.type === 'success') dialog.close();
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if dialog.editingId}
				<input type="hidden" name="id" value={dialog.editingId} />
			{/if}
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">
					{m.project_states_name()}
				</span>
				<input name="name" bind:value={draftName} class={input} required />
			</label>

			{#if dialog.editingId}
				<!-- The group is fixed when the state is created (#121): shown, never submitted. -->
				<div class="flex flex-col gap-[var(--space-1)]">
					<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">
						{m.project_states_group()}
					</span>
					<div><StatusBadge status={dialog.editing?.group ?? STATE_GROUPS[0]} /></div>
					<p class="text-[13px] leading-[18px] text-[var(--ink-muted)]">
						{m.project_states_group_fixed()}
					</p>
				</div>
			{:else}
				<SelectField
					label={m.project_states_group()}
					name="group"
					options={groupOptions}
					bind:value={draftGroup}
					required
				/>
			{/if}

			{#if dialogFailure}
				<p class="text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
					{dialogFailure}
				</p>
			{/if}

			<div class="flex justify-end gap-[var(--space-2)]">
				<Button type="button" variant="ghost" size="sm" onclick={dialog.close}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm" busy={saving}>{m.catalogue_save()}</Button>
			</div>
		</form>
	</Dialog>
</PageLayout>
