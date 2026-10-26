<script lang="ts">
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { enhance } from '$app/forms';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
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
	import LabelChip from '#lib/components/unitati/LabelChip.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import { catalogueColorLabel } from '#lib/catalogue-color-label.js';
	import {
		CATALOGUE_COLORS,
		DEFAULT_CATALOGUE_COLOR,
		catalogueColorVar,
		type CatalogueColor
	} from '#lib/domain/catalogue-color.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Entry = PageProps['data']['labels'][number];

	const dialog = catalogueDialog<Entry>({ createAction: 'create', editAction: 'update' });
	let draftName = $state('');
	let draftDescription = $state('');
	let draftColor = $state<CatalogueColor>(DEFAULT_CATALOGUE_COLOR);

	function openCreate() {
		draftName = '';
		draftDescription = '';
		draftColor = DEFAULT_CATALOGUE_COLOR;
		dialog.openCreate();
	}

	function openEdit(entry: Entry) {
		draftName = entry.name;
		draftDescription = entry.description ?? '';
		draftColor = entry.color;
		dialog.openEdit(entry);
	}

	const dialogFailure = $derived(dialog.failureFrom(form));
	let saving = $state(false);

	let confirmingId: string | null = $state(null);
	let pendingId: string | null = $state(null);

	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

<svelte:head>
	<title>{documentTitle(m.labels_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.labels_title()}>
		{#snippet summary()}{m.labels_lede()}{/snippet}
		{#snippet actions()}
			<Button onclick={openCreate}>{m.labels_create()}</Button>
		{/snippet}
	</PageHeader>

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.labels.length === 0}
			<EmptyState description={m.labels_empty()} />
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each data.labels as entry (entry.id)}
					<li class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
						<div class="min-w-0">
							<p class="flex flex-wrap items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
								<LabelChip name={entry.name} color={entry.color} />
								{#if !entry.active}
									<span class="text-xs text-[var(--ink-muted)]">{m.labels_archived_badge()}</span>
								{/if}
							</p>
							{#if entry.description}
								<p class="mt-[var(--space-1)] text-xs text-[var(--ink-muted)]">
									{entry.description}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-[var(--space-2)]">
							<form method="POST" action="?/archive" use:enhance>
								<input type="hidden" name="id" value={entry.id} />
								<input type="hidden" name="active" value={entry.active ? 'false' : 'true'} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									iconOnly
									title={entry.active ? m.labels_archive() : m.labels_unarchive()}
									aria-label={entry.active
										? m.labels_archive_title({ name: entry.name })
										: m.labels_unarchive_title({ name: entry.name })}
								>
									{#if entry.active}
										<ArchiveIcon class="size-4" aria-hidden="true" />
									{:else}
										<ArchiveRestoreIcon class="size-4" aria-hidden="true" />
									{/if}
								</Button>
							</form>
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
		title={dialog.editingId ? m.catalogue_edit_title({ name: draftName }) : m.labels_create()}
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
			{/if}

			<Field
				label={m.labels_name()}
				name="name"
				maxlength={data.nameMax}
				bind:value={draftName}
				required
			/>

			<TextAreaField
				label={m.labels_description()}
				name="description"
				hint={m.labels_description_hint()}
				maxlength={data.descriptionMax}
				rows={2}
				bind:value={draftDescription}
			/>

			<fieldset class="flex flex-col gap-[var(--space-2)]">
				<legend class="mb-[var(--space-1)] text-label text-[var(--ink)]">{m.labels_color()}</legend>
				<div class="flex flex-wrap gap-[var(--space-2)]">
					{#each CATALOGUE_COLORS as color (color)}
						<label
							class="relative size-8 cursor-pointer rounded-[var(--radius-full)] has-[:checked]:ring-2 has-[:checked]:ring-[var(--ink)] has-[:checked]:ring-offset-2 has-[:checked]:ring-offset-[var(--surface-1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
							style:background-color={catalogueColorVar(color)}
							title={catalogueColorLabel(color)}
						>
							<input
								type="radio"
								name="color"
								value={color}
								bind:group={draftColor}
								class="sr-only"
								aria-label={catalogueColorLabel(color)}
							/>
						</label>
					{/each}
				</div>
			</fieldset>

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
