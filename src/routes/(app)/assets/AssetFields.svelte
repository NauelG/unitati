<script lang="ts">
	import type { Snippet } from 'svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField, { type SelectOption } from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Values {
		name: string;
		assetTag?: string;
		serial?: string | null;
		assetModelId: string;
		shared?: boolean;
	}

	interface Props {
		values: Values;
		errors: Partial<Record<keyof Values, string[]>>;
		modelOptions: SelectOption[];
		/** Registering explains the generated tag; editing has no use for the hint. */
		tagHint?: string;
		/** What only this form asks for, between the model and the shared switch. */
		extra?: Snippet;
		/** The tag is required once an asset has one: clearing it would change nothing. */
		tagRequired?: boolean;
		/** A model can only be chosen from the catalogue, and an edit has one already. */
		modelPlaceholder?: string;
	}

	let {
		values = $bindable(),
		errors,
		modelOptions,
		tagHint,
		extra,
		tagRequired = false,
		modelPlaceholder
	}: Props = $props();
</script>

<div class="space-y-[var(--space-5)]">
	<Field
		label={m.asset_form_name()}
		name="name"
		bind:value={values.name}
		error={errors.name?.[0]}
		required
	/>

	<Field
		label={m.asset_form_tag()}
		name="assetTag"
		hint={tagHint}
		bind:value={values.assetTag}
		error={errors.assetTag?.[0]}
		required={tagRequired}
	/>

	<Field
		label={m.asset_form_serial()}
		name="serial"
		bind:value={values.serial}
		error={errors.serial?.[0]}
	/>

	<SelectField
		label={m.asset_form_model()}
		name="assetModelId"
		placeholder={modelPlaceholder}
		options={modelOptions}
		bind:value={values.assetModelId}
		error={errors.assetModelId?.[0]}
		required
	/>

	{@render extra?.()}

	<label class="flex items-start gap-[var(--space-3)]">
		<input
			type="checkbox"
			name="shared"
			class="mt-0.5 size-4 accent-[var(--brand)]"
			bind:checked={values.shared}
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
</div>
