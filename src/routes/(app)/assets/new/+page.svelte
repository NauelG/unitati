<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetFields from '../AssetFields.svelte';
	import { options, stateOptions } from '../options';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const asset = superForm(
		untrack(() => data.form),
		{ id: 'asset' }
	);
	const { form, errors, enhance, submitting } = asset;

	const model = superForm(
		untrack(() => data.modelForm),
		{
			id: 'model',
			onUpdated({ form: updated }) {
				const created = (updated.message as { createdModelId?: string } | undefined)
					?.createdModelId;
				if (updated.valid && created) $form.assetModelId = created;
			}
		}
	);
	const { form: modelValues, errors: modelErrors, enhance: modelEnhance } = model;
	const { submitting: modelSubmitting } = model;

	const modelOptions = $derived(
		options(data.models, (entry) => `${entry.manufacturerName} · ${entry.name}`)
	);
	const stateChoices = stateOptions();
	const locationOptions = $derived(options(data.locations, (entry) => entry.name));
	const manufacturerOptions = $derived(options(data.manufacturers, (entry) => entry.name));
	const categoryOptions = $derived(options(data.categories, (entry) => entry.name));

	const canCreateModel = $derived(data.manufacturers.length > 0 && data.categories.length > 0);
</script>

<svelte:head>
	<title>{m.asset_new_title()} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="font-display text-2xl font-semibold text-[var(--ink)]">{m.asset_new_title()}</h1>
	<p class="mt-2 text-[var(--ink-muted)]">{m.asset_new_lede()}</p>

	<form
		method="POST"
		action="?/register"
		use:enhance
		class="mt-[var(--space-6)] space-y-[var(--space-5)]"
	>
		<AssetFields
			bind:values={$form}
			errors={$errors}
			{modelOptions}
			modelPlaceholder={m.asset_form_model_placeholder()}
			tagHint={m.asset_form_tag_hint()}
		>
			{#snippet extra()}
				<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
					<SelectField
						label={m.asset_form_state()}
						name="state"
						options={stateChoices}
						bind:value={$form.state}
						error={$errors.state?.[0]}
					/>

					<SelectField
						label={m.asset_form_location()}
						name="locationId"
						placeholder={m.asset_form_no_location()}
						options={locationOptions}
						bind:value={$form.locationId}
						error={$errors.locationId?.[0]}
					/>
				</div>
			{/snippet}
		</AssetFields>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" size="lg" disabled={$submitting}>
				{$submitting ? m.form_saving() : m.asset_form_submit_new()}
			</Button>
			<Button href="/assets" variant="ghost" size="lg">{m.form_cancel()}</Button>
		</div>
	</form>

	<details
		class="mt-[var(--space-8)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-5)]"
		open={Boolean($modelErrors.name || $modelErrors.manufacturerId || $modelErrors.categoryId)}
	>
		<summary class="cursor-pointer text-sm font-medium text-[var(--ink)]">
			{m.model_inline_summary()}
		</summary>

		{#if canCreateModel}
			<form
				method="POST"
				action="?/createModel"
				use:modelEnhance
				class="mt-[var(--space-4)] space-y-[var(--space-4)]"
			>
				<Field
					label={m.model_form_name()}
					name="name"
					bind:value={$modelValues.name}
					error={$modelErrors.name?.[0]}
					required
				/>

				<div class="grid gap-[var(--space-4)] sm:grid-cols-2">
					<SelectField
						label={m.model_form_manufacturer()}
						name="manufacturerId"
						placeholder={m.model_form_choose_manufacturer()}
						options={manufacturerOptions}
						bind:value={$modelValues.manufacturerId}
						error={$modelErrors.manufacturerId?.[0]}
						required
					/>

					<SelectField
						label={m.model_form_category()}
						name="categoryId"
						placeholder={m.model_form_choose_category()}
						options={categoryOptions}
						bind:value={$modelValues.categoryId}
						error={$modelErrors.categoryId?.[0]}
						required
					/>
				</div>

				<Button type="submit" variant="secondary" disabled={$modelSubmitting}>
					{m.model_form_submit()}
				</Button>
			</form>
		{:else}
			<p class="mt-[var(--space-3)] text-sm text-[var(--ink-muted)]">
				{m.model_inline_needs_catalogue()}
				<a href="/assets/manufacturers" class="underline">{m.assets_nav_manufacturers()}</a>
				·
				<a href="/assets/categories" class="underline">{m.assets_nav_categories()}</a>
			</p>
		{/if}
	</details>
</div>
