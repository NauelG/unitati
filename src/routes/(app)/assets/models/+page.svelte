<script lang="ts">
	import { enhance } from '$app/forms';
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
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import type { AssetModelEntry } from '#lib/server/assets/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import AssetsNav from '../AssetsNav.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Same input styling as `Field`.
	const control = field().input();

	const canCreate = $derived(data.manufacturers.length > 0 && data.categories.length > 0);

	const manufacturerOptions = $derived(
		data.manufacturers.map((manufacturer) => ({ value: manufacturer.id, label: manufacturer.name }))
	);
	const categoryOptions = $derived(
		data.categories.map((category) => ({ value: category.id, label: category.name }))
	);

	type Model = AssetModelEntry;

	/**
	 * ADR 0020: the catalogue is the list (`index`), and create/edit is a
	 * `Dialog` instead of an inline create row plus three always-live edit
	 * inputs per model row.
	 */
	const dialog = catalogueDialog<Model>({ createAction: 'create', editAction: 'update' });
	let draftName = $state('');
	let draftManufacturerId: string | null = $state(null);
	let draftCategoryId: string | null = $state(null);

	function openCreate() {
		draftName = '';
		draftManufacturerId = null;
		draftCategoryId = null;
		dialog.openCreate();
	}

	function openEdit(model: Model) {
		draftName = model.name;
		draftManufacturerId = model.manufacturerId;
		draftCategoryId = model.categoryId;
		dialog.openEdit(model);
	}

	const dialogAction = $derived(dialog.editingId ? '?/update' : '?/create');
	const dialogFailure = $derived(dialog.failureFrom(form));
	/** Same reasoning as `NameCatalogue` (#89): `busy`, not optimistic — the dialog stays open to show `dialogFailure` on a refusal. */
	let saving = $state(false);

	/** The model asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	/** The model whose delete POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);

	const deleteFailure = $derived(deleteFailureFrom(form, confirmingId));
</script>

<svelte:head>
	<title>{m.catalogue_models_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.catalogue_models_title()}>
		{#snippet summary()}{m.catalogue_models_lede()}{/snippet}
		{#snippet actions()}
			{#if canCreate}
				<Button onclick={openCreate}>{m.catalogue_new_model()}</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<AssetsNav showCatalogue />

	{#if !canCreate}
		<p class="mt-[var(--space-6)] text-sm text-[var(--ink-muted)]">
			{m.model_inline_needs_catalogue()}
			<a href="/assets/manufacturers" class="underline">{m.assets_nav_manufacturers()}</a>
			·
			<a href="/assets/categories" class="underline">{m.assets_nav_categories()}</a>
		</p>
	{/if}

	{#if deleteFailure}
		<Alert tone="danger" class="mt-[var(--space-6)]">{deleteFailure}</Alert>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.models.length === 0}
			<EmptyState description={m.catalogue_empty_models()} />
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each data.models as model (model.id)}
					<li class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]">
						<div class="grid min-w-0 flex-1 gap-[var(--space-1)] sm:grid-cols-3">
							<span class="truncate text-sm font-medium text-[var(--ink)]">{model.name}</span>
							<span class="truncate text-sm text-[var(--ink-muted)]">{model.manufacturerName}</span>
							<span class="truncate text-sm text-[var(--ink-muted)]">{model.categoryName}</span>
						</div>
						<div class="flex shrink-0 items-center gap-[var(--space-2)]">
							<Button variant="secondary" size="sm" onclick={() => openEdit(model)}>
								{m.catalogue_edit()}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={() => (confirmingId = model.id)}
							>
								{m.catalogue_delete()}
							</Button>
						</div>

						<ConfirmDialog
							open={confirmingId === model.id}
							onOpenChange={(next) => {
								if (!next) confirmingId = null;
							}}
							title={m.catalogue_delete_title({ name: model.name })}
							description={m.catalogue_delete_ask()}
							confirmLabel={m.catalogue_delete()}
							pending={pendingId === model.id}
							error={confirmingId === model.id && form?.id === model.id ? form.message : null}
						>
							{#snippet action(confirm)}
								<form
									method="POST"
									action="?/delete"
									use:enhance={confirmSubmit({
										onPending: (pending) => (pendingId = pending ? model.id : null),
										onSettled: (succeeded) => {
											if (succeeded) confirmingId = null;
										}
									})}
								>
									<input type="hidden" name="id" value={model.id} />
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
		title={dialog.editing
			? m.catalogue_edit_title({ name: dialog.editing.name })
			: m.catalogue_new_model()}
	>
		<form
			method="POST"
			action={dialogAction}
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
				<span class="text-[13px] leading-4 font-medium text-[var(--ink)]"
					>{m.catalogue_column_name()}</span
				>
				<input name="name" bind:value={draftName} class={control} required />
			</label>

			<SelectField
				label={m.catalogue_column_manufacturer()}
				name="manufacturerId"
				placeholder={m.model_form_choose_manufacturer()}
				options={manufacturerOptions}
				bind:value={draftManufacturerId}
				required
			/>
			<SelectField
				label={m.catalogue_column_category()}
				name="categoryId"
				placeholder={m.model_form_choose_category()}
				options={categoryOptions}
				bind:value={draftCategoryId}
				required
			/>

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
