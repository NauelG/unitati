<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import ConfirmDialog from '#lib/components/unitati/ConfirmDialog.svelte';
	import { confirmSubmit } from '#lib/components/unitati/confirm-submit.js';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetsNav from '../AssetsNav.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Same input styling as `Field`.
	const control = field().input();
	const label = field().label();

	const canCreate = $derived(data.manufacturers.length > 0 && data.categories.length > 0);

	const manufacturerOptions = $derived(
		data.manufacturers.map((manufacturer) => ({ value: manufacturer.id, label: manufacturer.name }))
	);
	const categoryOptions = $derived(
		data.categories.map((category) => ({ value: category.id, label: category.name }))
	);

	/** The model asking "are you sure?", if any: one at a time. */
	let confirmingId: string | null = $state(null);
	/** The model whose delete POST is in flight: blocks Cancel/Escape on its dialog. */
	let pendingId: string | null = $state(null);
</script>

{#snippet failure(id: string | null)}
	{#if form?.message && (form.id ?? null) === id}
		<p class="mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
			{form.message}
		</p>
	{/if}
{/snippet}

<svelte:head>
	<title>{m.catalogue_models_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.catalogue_models_title()}>
		{#snippet summary()}{m.catalogue_models_lede()}{/snippet}
	</PageHeader>

	<AssetsNav showCatalogue />

	{#if canCreate}
		<form
			method="POST"
			action="?/create"
			use:enhance
			class="mt-[var(--space-6)] grid items-end gap-[var(--space-3)] sm:grid-cols-[1fr_1fr_1fr_auto]"
		>
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class={label}>{m.catalogue_new_model()}</span>
				<input name="name" class={control} required />
			</label>
			<SelectField
				label={m.catalogue_column_manufacturer()}
				name="manufacturerId"
				placeholder={m.model_form_choose_manufacturer()}
				options={manufacturerOptions}
				required
			/>
			<SelectField
				label={m.catalogue_column_category()}
				name="categoryId"
				placeholder={m.model_form_choose_category()}
				options={categoryOptions}
				required
			/>
			<Button type="submit">{m.catalogue_create()}</Button>
		</form>
		{@render failure(null)}
	{:else}
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
					<li class="p-[var(--space-3)]">
						<form
							method="POST"
							use:enhance
							class="grid items-center gap-[var(--space-3)] sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
						>
							<input type="hidden" name="id" value={model.id} />
							<input
								name="name"
								value={model.name}
								aria-label={m.catalogue_column_name()}
								class={control}
								required
							/>
							<SelectField
								label={m.catalogue_column_manufacturer()}
								labelHidden
								name="manufacturerId"
								options={manufacturerOptions}
								value={model.manufacturerId}
								required
							/>
							<SelectField
								label={m.catalogue_column_category()}
								labelHidden
								name="categoryId"
								options={categoryOptions}
								value={model.categoryId}
								required
							/>
							<Button type="submit" formaction="?/update" variant="secondary" size="sm">
								{m.catalogue_save()}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={() => (confirmingId = model.id)}
							>
								{m.catalogue_delete()}
							</Button>
						</form>

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

						{#if confirmingId !== model.id}
							{@render failure(model.id)}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PageLayout>
