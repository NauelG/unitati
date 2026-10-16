<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetFields from '../AssetFields.svelte';
	import { locationOptions, options, stateOptions } from '../options';
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
	const locationChoices = $derived(locationOptions(data.locations));
	const manufacturerOptions = $derived(options(data.manufacturers, (entry) => entry.name));
	const categoryOptions = $derived(options(data.categories, (entry) => entry.name));

	const canCreateModel = $derived(data.manufacturers.length > 0 && data.categories.length > 0);
</script>

<svelte:head>
	<title>{documentTitle(m.asset_new_title())}</title>
</svelte:head>

<PageLayout variant="record">
	<PageHeader title={m.asset_new_title()}>
		{#snippet summary()}{m.asset_new_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/register"
		use:enhance
		class="mt-[var(--space-6)] max-w-2xl space-y-[var(--space-5)]"
	>
		<!-- layout-ok: the fields themselves stay a readable measure; the ADR
		     0020 record-variant side column is where the width this page gained
		     actually goes (the model-creation helper), not into stretching a
		     name/tag/serial form across the full ceiling. -->
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
						options={locationChoices}
						bind:value={$form.locationId}
						error={$errors.locationId?.[0]}
					/>
				</div>
			{/snippet}
		</AssetFields>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" size="lg" busy={$submitting}>
				{$submitting ? m.form_saving() : m.asset_form_submit_new()}
			</Button>
			<Button href="/assets" variant="ghost" size="lg">{m.form_cancel()}</Button>
		</div>
	</form>

	{#snippet side()}
		<WorkPanel heading={m.model_inline_summary()}>
			{#if canCreateModel}
				<form
					method="POST"
					action="?/createModel"
					use:modelEnhance
					class="space-y-[var(--space-4)]"
				>
					<Field
						label={m.model_form_name()}
						name="name"
						bind:value={$modelValues.name}
						error={$modelErrors.name?.[0]}
						required
					/>

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

					<Button type="submit" variant="secondary" busy={$modelSubmitting}>
						{m.model_form_submit()}
					</Button>
				</form>
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">
					{m.model_inline_needs_catalogue()}
					<a href="/settings/assets/manufacturers" class="underline"
						>{m.assets_nav_manufacturers()}</a
					>
					·
					<a href="/settings/assets/categories" class="underline">{m.assets_nav_categories()}</a>
				</p>
			{/if}
		</WorkPanel>
	{/snippet}
</PageLayout>
