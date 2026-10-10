<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
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
	 * inputs per model row. `editing` holds the row being edited, or `null`
	 * while creating.
	 */
	let editing: Model | null = $state(null);
	let dialogVisible = $state(false);
	let draftName = $state('');
	let draftManufacturerId: string | null = $state(null);
	let draftCategoryId: string | null = $state(null);

	function openCreate() {
		editing = null;
		draftName = '';
		draftManufacturerId = null;
		draftCategoryId = null;
		dialogVisible = true;
	}

	function openEdit(model: Model) {
		editing = model;
		draftName = model.name;
		draftManufacturerId = model.manufacturerId;
		draftCategoryId = model.categoryId;
		dialogVisible = true;
	}

	function closeDialog() {
		dialogVisible = false;
	}

	const dialogAction = $derived(editing ? '?/update' : '?/create');
	// A plain function parameter narrows cleanly; `editing` itself is a
	// reassignable `let` captured by the closure `$derived` wraps its
	// expression in, so TS widens it back to `Model | null` before a
	// property access on the same mutable binding — a known rough edge with
	// Svelte 5 runes, not a real type error.
	function idOf(entry: Model | null): string | null {
		return entry === null ? null : entry.id;
	}
	const editingId = $derived(idOf(editing));
	// Destructured first: comparing `form.id`/`form.action` directly inside one
	// `&&` chain makes TS try to narrow `form`'s own union by the `action`
	// check, which collapses to `never` here because the server's failure
	// shape types `action` as a plain `string`. Reading each field through its
	// own `$derived` sidesteps that narrowing entirely.
	const formId = $derived(form?.id ?? null);
	const formAction = $derived(form?.action ?? null);
	const formMessage = $derived(form?.message ?? null);
	const dialogFailure = $derived(
		dialogVisible && formAction !== 'delete' && formId === editingId ? formMessage : null
	);

	/** The model asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	/** The model whose delete POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);
</script>

{#snippet failure(id: string | null)}
	{#if form?.message && (form.id ?? null) === id && confirmingId !== id}
		<p class="mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
			{form.message}
		</p>
	{/if}
{/snippet}

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

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if data.models.length === 0}
			<p
				class="px-[var(--space-6)] py-[var(--space-12)] text-center text-sm text-[var(--ink-muted)]"
			>
				{m.catalogue_empty_models()}
			</p>
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
					{@render failure(model.id)}
				{/each}
			</ul>
		{/if}
	</div>

	<Dialog
		open={dialogVisible}
		onOpenChange={(next) => {
			if (!next) closeDialog();
		}}
		title={editing ? m.catalogue_edit_title({ name: editing.name }) : m.catalogue_new_model()}
	>
		<form
			method="POST"
			action={dialogAction}
			use:enhance={() => {
				return async ({ result: submitResult, update }) => {
					await update();
					if (submitResult.type === 'success') closeDialog();
				};
			}}
			class="space-y-[var(--space-4)]"
		>
			{#if editing}
				<input type="hidden" name="id" value={editing.id} />
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
				<Button type="button" variant="ghost" size="sm" onclick={closeDialog}>
					{m.form_cancel()}
				</Button>
				<Button type="submit" size="sm">{m.catalogue_save()}</Button>
			</div>
		</form>
	</Dialog>
</PageLayout>
