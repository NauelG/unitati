<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import { ASSET_STATES } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
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
		data.models.map((entry) => ({
			value: entry.id,
			label: `${entry.manufacturerName} · ${entry.name}`
		}))
	);
	const stateOptions = ASSET_STATES.map((key) => ({ value: key, label: statusLabel(key) }));
	const locationOptions = $derived(
		data.locations.map((entry) => ({ value: entry.id, label: entry.name }))
	);
	const manufacturerOptions = $derived(
		data.manufacturers.map((entry) => ({ value: entry.id, label: entry.name }))
	);
	const categoryOptions = $derived(
		data.categories.map((entry) => ({ value: entry.id, label: entry.name }))
	);

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
		<Field
			label={m.asset_form_name()}
			name="name"
			bind:value={$form.name}
			error={$errors.name?.[0]}
			required
		/>

		<Field
			label={m.asset_form_tag()}
			name="assetTag"
			hint={m.asset_form_tag_hint()}
			bind:value={$form.assetTag}
			error={$errors.assetTag?.[0]}
		/>

		<Field
			label={m.asset_form_serial()}
			name="serial"
			bind:value={$form.serial}
			error={$errors.serial?.[0]}
		/>

		<SelectField
			label={m.asset_form_model()}
			name="assetModelId"
			placeholder={m.asset_form_model_placeholder()}
			options={modelOptions}
			bind:value={$form.assetModelId}
			error={$errors.assetModelId?.[0]}
			required
		/>

		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<SelectField
				label={m.asset_form_state()}
				name="state"
				options={stateOptions}
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

		<label class="flex items-start gap-[var(--space-3)]">
			<input
				type="checkbox"
				name="shared"
				class="mt-0.5 size-4 accent-[var(--brand)]"
				bind:checked={$form.shared}
			/>
			<span>
				<span class="block text-[13px] leading-4 font-medium text-[var(--ink)]">
					{m.asset_form_shared()}
				</span>
				<span class="block text-[13px] leading-[18px] text-[var(--ink-muted)]">
					{m.asset_form_shared_hint()}
				</span>
			</span>
		</label>

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
