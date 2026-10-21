<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
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
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = PageProps['data']['forms'][number];

	const dialog = catalogueDialog<Entry>({ createAction: 'create', editAction: 'update' });
	let draftName = $state('');
	let draftDescription = $state('');
	let draftQueueId = $state<string | null>(null);
	let draftActive = $state(true);

	const queueOptions = $derived(data.queues.map((q) => ({ value: q.id, label: q.name })));

	function openCreate() {
		draftName = '';
		draftDescription = '';
		draftQueueId = null;
		draftActive = true;
		dialog.openCreate();
	}

	function openEdit(entry: Entry) {
		draftName = entry.name;
		draftDescription = entry.description;
		draftQueueId = entry.queueId;
		draftActive = entry.active;
		dialog.openEdit(entry);
	}

	const dialogFailure = $derived(dialog.failureFrom(form));
	let saving = $state(false);

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

<svelte:head>
	<title>{documentTitle(m.request_forms_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.request_forms_title()}>
		{#snippet summary()}{m.request_forms_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate} disabled={data.queues.length === 0}>
				{m.request_forms_create()}
			</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.forms.length === 0}
			<EmptyState description={m.request_forms_empty()} />
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each data.forms as entry (entry.id)}
					<li class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
						<div class="min-w-0">
							<p class="text-sm text-[var(--ink)]">
								{entry.name}
								{#if !entry.active}
									<span class="ml-[var(--space-2)] text-xs text-[var(--ink-muted)]">
										{m.request_forms_inactive_badge()}
									</span>
								{/if}
							</p>
							<p class="text-xs text-[var(--ink-muted)]">
								{m.request_forms_kind_equipment()} · {entry.queueName}
							</p>
						</div>
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
							error={confirmingId === entry.id && form?.id === entry.id ? form.message : null}
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
		title={dialog.editingId
			? m.catalogue_edit_title({ name: draftName })
			: m.request_forms_create()}
	>
		<form
			method="POST"
			action={dialog.editingId ? '?/update' : '?/create'}
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
			{:else}
				<!-- The only kind there is; fixed at creation (ADR 0037). -->
				<input type="hidden" name="kind" value="equipment" />
			{/if}

			<Field label={m.request_forms_name()} name="name" bind:value={draftName} required />

			<TextAreaField
				label={m.request_forms_description()}
				name="description"
				hint={m.request_forms_description_hint()}
				maxlength={data.descriptionMax}
				rows={3}
				bind:value={draftDescription}
			/>

			<SelectField
				label={m.request_forms_queue()}
				name="queueId"
				placeholder={m.request_forms_queue_placeholder()}
				options={queueOptions}
				bind:value={draftQueueId}
				required
			/>

			<label class="flex items-start gap-[var(--space-2)] text-sm">
				<input type="checkbox" name="active" bind:checked={draftActive} class="mt-1" />
				<span>
					{m.request_forms_active()}
					<span class="block text-xs text-[var(--ink-muted)]">{m.request_forms_active_hint()}</span>
				</span>
			</label>

			{#if dialogFailure}
				<FormError>{dialogFailure}</FormError>
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
