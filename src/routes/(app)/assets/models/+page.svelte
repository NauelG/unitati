<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetsNav from '../AssetsNav.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Same input styling as `Field`, labelled by `aria-label` rather than a
	// visible caption: a column header names the control in a dense list.
	const control = field().input();
	const label = field().label();

	const canCreate = $derived(data.manufacturers.length > 0 && data.categories.length > 0);
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
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class={label}>{m.catalogue_column_manufacturer()}</span>
				<select name="manufacturerId" class={control} required>
					<option value="">{m.model_form_choose_manufacturer()}</option>
					{#each data.manufacturers as manufacturer (manufacturer.id)}
						<option value={manufacturer.id}>{manufacturer.name}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-[var(--space-1)]">
				<span class={label}>{m.catalogue_column_category()}</span>
				<select name="categoryId" class={control} required>
					<option value="">{m.model_form_choose_category()}</option>
					{#each data.categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</label>
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
							<select
								name="manufacturerId"
								aria-label={m.catalogue_column_manufacturer()}
								class={control}
								required
							>
								{#each data.manufacturers as manufacturer (manufacturer.id)}
									<option
										value={manufacturer.id}
										selected={manufacturer.id === model.manufacturerId}
									>
										{manufacturer.name}
									</option>
								{/each}
							</select>
							<select
								name="categoryId"
								aria-label={m.catalogue_column_category()}
								class={control}
								required
							>
								{#each data.categories as category (category.id)}
									<option value={category.id} selected={category.id === model.categoryId}>
										{category.name}
									</option>
								{/each}
							</select>
							<Button type="submit" formaction="?/update" variant="secondary" size="sm">
								{m.catalogue_save()}
							</Button>
							<Button type="submit" formaction="?/delete" variant="ghost" size="sm">
								{m.catalogue_delete()}
							</Button>
						</form>
						{@render failure(model.id)}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PageLayout>
