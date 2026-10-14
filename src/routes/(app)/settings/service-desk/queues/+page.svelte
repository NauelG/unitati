<script lang="ts">
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
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	interface Queue {
		id: string;
		name: string;
	}

	// Same input styling as `Field`, without its label: a row in a list is
	// labelled by its position (ADR 0020, as `NameCatalogue`).
	const input = field().input();

	const dialog = catalogueDialog<Queue>({ createAction: 'create', editAction: 'rename' });
	let draftName = $state('');

	function openCreate() {
		draftName = '';
		dialog.openCreate();
	}

	function openEdit(queue: Queue) {
		draftName = queue.name;
		dialog.openEdit(queue);
	}

	const dialogFailure = $derived(dialog.failureFrom(form));
	/** Same reasoning as `NameCatalogue` (#89): `busy`, not optimistic — the dialog stays open to show `dialogFailure` on a refusal. */
	let saving = $state(false);

	/** The queue asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	/** The queue whose delete POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);

	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

<svelte:head>
	<title>{m.queues_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.queues_title()}>
		{#snippet summary()}{m.queues_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>{m.queues_create()}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.queues.length === 0}
			<EmptyState description={m.queues_empty()} />
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each data.queues as queue (queue.id)}
					<li class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
						<span class="min-w-0 truncate text-sm text-[var(--ink)]">{queue.name}</span>
						<div class="flex shrink-0 items-center gap-[var(--space-2)]">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								iconOnly
								title={m.catalogue_edit()}
								aria-label={m.catalogue_edit_title({ name: queue.name })}
								onclick={() => openEdit(queue)}
							>
								<PencilIcon class="size-4" aria-hidden="true" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								iconOnly
								title={m.catalogue_delete()}
								aria-label={m.catalogue_delete_title({ name: queue.name })}
								onclick={() => (confirmingId = queue.id)}
							>
								<Trash2Icon class="size-4" aria-hidden="true" />
							</Button>
						</div>

						<ConfirmDialog
							open={confirmingId === queue.id}
							onOpenChange={(next) => {
								if (!next) confirmingId = null;
							}}
							title={m.catalogue_delete_title({ name: queue.name })}
							description={m.catalogue_delete_ask()}
							confirmLabel={m.catalogue_delete()}
							pending={pendingId === queue.id}
							error={confirmingId === queue.id && form?.id === queue.id ? form.message : null}
						>
							{#snippet action(confirm)}
								<form
									method="POST"
									action="?/delete"
									use:enhance={confirmSubmit({
										onPending: (pending) => (pendingId = pending ? queue.id : null),
										onSettled: (succeeded) => {
											if (succeeded) confirmingId = null;
										}
									})}
								>
									<input type="hidden" name="id" value={queue.id} />
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
		title={dialog.editingId ? m.catalogue_edit_title({ name: draftName }) : m.queues_create()}
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
				<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">{m.queues_name()}</span>
				<input name="name" bind:value={draftName} class={input} required />
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
