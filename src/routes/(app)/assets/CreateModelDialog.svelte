<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { options } from './options';

	interface Named {
		id: string;
		name: string;
	}

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** The `createModel` action of the route that mounts this dialog. */
		action: string;
		/** The route's `modelForm` load data. */
		form: SuperValidated<{ name: string; manufacturerId: string; categoryId: string }>;
		manufacturers: Named[];
		categories: Named[];
		/** Fired once the model exists, with its id, so the caller can select it. */
		oncreated: (modelId: string) => void;
	}

	let {
		open,
		onOpenChange,
		action,
		form: seed,
		manufacturers,
		categories,
		oncreated
	}: Props = $props();

	const model = superForm(
		untrack(() => seed),
		{
			id: 'model',
			onUpdated({ form: updated }) {
				const created = (updated.message as { createdModelId?: string } | undefined)
					?.createdModelId;
				if (updated.valid && created) oncreated(created);
			}
		}
	);
	const { form, errors, enhance, submitting } = model;

	const manufacturerOptions = $derived(options(manufacturers, (entry) => entry.name));
	const categoryOptions = $derived(options(categories, (entry) => entry.name));
	const canCreate = $derived(manufacturers.length > 0 && categories.length > 0);
</script>

<Dialog
	{open}
	{onOpenChange}
	pending={$submitting}
	title={m.model_dialog_title()}
	description={canCreate ? undefined : m.model_inline_needs_catalogue()}
>
	{#if canCreate}
		<form method="POST" {action} use:enhance class="space-y-[var(--space-4)]">
			<Field
				label={m.model_form_name()}
				name="name"
				bind:value={$form.name}
				error={$errors.name?.[0]}
				required
			/>

			<SelectField
				label={m.model_form_manufacturer()}
				name="manufacturerId"
				placeholder={m.model_form_choose_manufacturer()}
				options={manufacturerOptions}
				bind:value={$form.manufacturerId}
				error={$errors.manufacturerId?.[0]}
				required
			/>

			<SelectField
				label={m.model_form_category()}
				name="categoryId"
				placeholder={m.model_form_choose_category()}
				options={categoryOptions}
				bind:value={$form.categoryId}
				error={$errors.categoryId?.[0]}
				required
			/>

			<div class="flex items-center gap-[var(--space-3)]">
				<Button type="submit" busy={$submitting}>{m.model_form_submit()}</Button>
				<Button
					type="button"
					variant="ghost"
					disabled={$submitting}
					onclick={() => onOpenChange(false)}
				>
					{m.form_cancel()}
				</Button>
			</div>
		</form>
	{:else}
		<ul class="space-y-[var(--space-2)] text-sm">
			{#if manufacturers.length === 0}
				<li>
					<a href="/settings/assets/manufacturers" class="text-[var(--brand)] underline">
						{m.assets_nav_manufacturers()}
					</a>
				</li>
			{/if}
			{#if categories.length === 0}
				<li>
					<a href="/settings/assets/categories" class="text-[var(--brand)] underline">
						{m.assets_nav_categories()}
					</a>
				</li>
			{/if}
		</ul>
		<div class="mt-[var(--space-4)]">
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)}>
				{m.form_cancel()}
			</Button>
		</div>
	{/if}
</Dialog>
