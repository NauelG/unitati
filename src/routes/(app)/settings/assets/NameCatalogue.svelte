<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import {
		catalogueDialog,
		deleteFailureFrom
	} from '#lib/components/unitati/catalogue-dialog.svelte.js';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Entry {
		id: string;
		name: string;
	}

	interface Props {
		title: string;
		lede: string;
		newLabel: string;
		emptyMessage: string;
		entries: Entry[];
		/** The last action's result: a failure carries the message and, for a row, its id. */
		result: { action: string; message: string | null; id: string | null } | null | undefined;
	}

	let { title, lede, newLabel, emptyMessage, entries, result }: Props = $props();

	// The same input styling as `Field`, without its label: a row in a list is
	// labelled by its position, and a visible "Nombre" above every line is noise.
	const input = field().input();

	/**
	 * ADR 0020: the catalogue is the list (`index`), and create/edit is a
	 * `Dialog` — one name field, one action — instead of an always-live inline
	 * form and three always-live edit rows.
	 */
	const dialog = catalogueDialog<Entry>({ createAction: 'create', editAction: 'rename' });
	let editingName = $state('');

	function openCreate() {
		editingName = '';
		dialog.openCreate();
	}

	function openEdit(entry: Entry) {
		editingName = entry.name;
		dialog.openEdit(entry);
	}

	const dialogFailure = $derived(dialog.failureFrom(result));
	/**
	 * Create/rename keep the dialog open on failure to show `dialogFailure`
	 * inline — an optimistic close-then-rollback would hide that message
	 * behind a toast instead of next to the field it is about. `Button`'s
	 * `busy` prop is the feedback while the request is in flight (#89).
	 */
	let saving = $state(false);

	/** The entry asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	/** The entry whose delete POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);

	const deleteFailure = $derived(deleteFailureFrom(result, confirmingId));
</script>

<svelte:head>
	<title>{documentTitle(title)}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader {title}>
		{#snippet summary()}{lede}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>{newLabel}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if entries.length === 0}
			<EmptyState description={emptyMessage} />
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each entries as entry (entry.id)}
					<li class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
						<span class="min-w-0 truncate text-sm text-[var(--ink)]">{entry.name}</span>
						<div class="flex shrink-0 items-center gap-[var(--space-2)]">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								iconOnly
								title={m.catalogue_edit()}
								aria-label={m.catalogue_edit_title({ name: entry.name })}
								onclick={() => openEdit(entry)}
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
								aria-label={m.catalogue_delete_title({ name: entry.name })}
								onclick={() => (confirmingId = entry.id)}
							>
								<Trash2Icon class="size-4" aria-hidden="true" />
							</Button>
						</div>

						<ConfirmDialog
							open={confirmingId === entry.id}
							onOpenChange={(next) => {
								if (!next) confirmingId = null;
							}}
							title={m.catalogue_delete_title({ name: entry.name })}
							description={m.catalogue_delete_ask()}
							confirmLabel={m.catalogue_delete()}
							pending={pendingId === entry.id}
							error={confirmingId === entry.id && result?.id === entry.id ? result.message : null}
						>
							{#snippet action(confirm)}
								<form
									method="POST"
									action="?/delete"
									use:enhance={confirmSubmit({
										onPending: (pending) => (pendingId = pending ? entry.id : null),
										onSettled: (succeeded) => {
											if (succeeded) confirmingId = null;
										}
									})}
								>
									<input type="hidden" name="id" value={entry.id} />
									{@render confirm()}
								</form>
							{/snippet}
						</ConfirmDialog>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<Dialog
		open={dialog.open}
		onOpenChange={(next) => {
			if (!next) dialog.close();
		}}
		title={dialog.editingId ? m.catalogue_edit_title({ name: editingName }) : newLabel}
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
				<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">{newLabel}</span>
				<input name="name" bind:value={editingName} class={input} required />
			</label>

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
